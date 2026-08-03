"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi } from "../api/products.api";
import { productsKeys } from "../queries/use-products";
import { keyForAttributes } from "../lib/variant-key";
import type { Variant, VariantDraft } from "../schemas/variant.schema";

/**
 * Variant diffing on edit: re-fetches the product fresh (doesn't trust local
 * state) as the diffing baseline, then upserts every desired combo and deletes
 * whatever existing variant isn't in the desired set anymore.
 *
 * Deliberate behavior change from the old sequential-await version: desired
 * combos are upserted concurrently via `Promise.allSettled` (a mid-loop network
 * blip on one variant no longer blocks the others), and the delete pass only
 * runs once every upsert has succeeded — trading "always attempt deletes" for
 * "never delete against a baseline we know is incomplete". A batch endpoint on
 * the API would be the real fix; out of scope here.
 */
export function useUpdateProduct(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      productId: string;
      name: string;
      description: string;
      price: string;
      currency: string;
      stock: string;
      categoryId: string;
      imageFile: File | null;
      variants: VariantDraft[];
      variantImages: Record<string, File | null>;
      fallbackErrorMessage?: string;
    }) => {
      const sid = storeId as string;

      await productsApi.update(
        sid,
        input.productId,
        {
          name: input.name,
          description: input.description || undefined,
          price: Number(input.price),
          currency: input.currency,
          categoryIds: input.categoryId ? [input.categoryId] : [],
        },
        input.fallbackErrorMessage,
      );

      const current = await productsApi.get(
        sid,
        input.productId,
        input.fallbackErrorMessage,
      );
      const currentVariants = current.variants ?? [];

      if (input.variants.length > 0) {
        const existingByKey = new Map<string, Variant>();
        currentVariants.forEach((variant) => {
          existingByKey.set(keyForAttributes(variant.attributes), variant);
        });
        const desiredKeys = new Set(
          input.variants.map((draft) => keyForAttributes(draft.attributes)),
        );

        const upsertResults = await Promise.allSettled(
          input.variants.map(async (draft) => {
            const key = keyForAttributes(draft.attributes);
            const existing = existingByKey.get(key);
            let variantId: string;
            if (existing) {
              await productsApi.updateVariant(
                sid,
                input.productId,
                existing.id,
                {
                  name: draft.name,
                  stock: draft.stock === undefined ? null : draft.stock,
                  priceOverride: draft.priceOverride === undefined
                    ? null
                    : draft.priceOverride,
                  attributes: draft.attributes ?? {},
                },
                input.fallbackErrorMessage,
              );
              variantId = existing.id;
            } else {
              const payload: Record<string, unknown> = {
                name: draft.name,
                attributes: draft.attributes ?? {},
              };
              if (draft.stock !== undefined) payload.stock = draft.stock;
              if (draft.priceOverride !== undefined) {
                payload.priceOverride = draft.priceOverride;
              }
              const createdVariant = await productsApi.createVariant(
                sid,
                input.productId,
                payload,
                input.fallbackErrorMessage,
              );
              variantId = createdVariant.id;
            }

            const file = input.variantImages[key];
            if (file) {
              await productsApi.uploadVariantImage(
                sid,
                input.productId,
                variantId,
                file,
                input.fallbackErrorMessage,
              );
            }
          }),
        );

        const failures = upsertResults.filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        if (failures.length > 0) {
          const message = failures
            .map((
              failure,
            ) => (failure.reason instanceof Error
              ? failure.reason.message
              : String(failure.reason))
            )
            .join("; ");
          throw new Error(message || input.fallbackErrorMessage);
        }

        await Promise.all(
          currentVariants
            .filter((variant) =>
              !desiredKeys.has(keyForAttributes(variant.attributes))
            )
            .map((variant) =>
              productsApi.deleteVariant(sid, input.productId, variant.id)
            ),
        );
      } else {
        const desiredStock = input.stock ? Number(input.stock) : null;
        const baseVariant = currentVariants.find((variant) =>
          Object.keys(variant.attributes ?? {}).length === 0
        ) ??
          currentVariants[0];

        if (baseVariant) {
          await productsApi.updateVariant(
            sid,
            input.productId,
            baseVariant.id,
            {
              name: baseVariant.name || "Default",
              stock: desiredStock,
              priceOverride: null,
              attributes: {},
            },
            input.fallbackErrorMessage,
          );
        } else {
          const payload: Record<string, unknown> = {
            name: "Default",
            attributes: {},
          };
          if (desiredStock !== null) {
            payload.stock = desiredStock;
          }
          await productsApi.createVariant(
            sid,
            input.productId,
            payload,
            input.fallbackErrorMessage,
          );
        }

        const baseId = baseVariant?.id;
        await Promise.all(
          currentVariants
            .filter((variant) =>
              variant.id !== baseId
            )
            .map((variant) =>
              productsApi.deleteVariant(sid, input.productId, variant.id)
            ),
        );
      }

      if (input.imageFile) {
        await productsApi.uploadImage(sid, input.productId, input.imageFile, {
          replace: true,
          fallbackErrorMessage: input.fallbackErrorMessage,
        });
      }
    },
    onSuccess: (_data, input) => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: productsKeys.byStore(storeId),
      });
      queryClient.invalidateQueries({
        queryKey: productsKeys.detail(storeId, input.productId),
      });
    },
  });
}
