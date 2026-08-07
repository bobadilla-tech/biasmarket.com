"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { productsApi } from "../api/products.api";
import { productsKeys } from "../queries/use-products";
import { keyForAttributes } from "../lib/variant-key";
import { availabilityFlags } from "../lib/availability-state";
import type { VariantDraft } from "../schemas/variant.schema";

export function useCreateProduct(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description: string;
      price: string;
      currency: string;
      stock: string;
      categoryId: string;
        availability: "AVAILABLE" | "OUT_OF_STOCK" | "DISCONTINUED";
      imageFile: File | null;
      variants: VariantDraft[];
      variantImages: Record<string, File | null>;
      fallbackErrorMessage?: string;
    }) => {
      const sid = storeId as string;
      const { soldOut, discontinued } = availabilityFlags(input.availability);
      const created = await apiClient.products.create(
        sid,
        {
          name: input.name,
          description: input.description || undefined,
          price: Number(input.price),
          currency: input.currency,
          soldOut,
          discontinued,
          stock: input.variants.length === 0 && input.stock
            ? Number(input.stock)
            : undefined,
          variants: input.variants.length > 0 ? input.variants : undefined,
          categoryIds: input.categoryId ? [input.categoryId] : undefined,
        },
        { fallbackErrorMessage: input.fallbackErrorMessage },
      );

      if (input.imageFile) {
        await productsApi.uploadImage(sid, created.id, input.imageFile, {
          fallbackErrorMessage: input.fallbackErrorMessage,
        });
      }

      const createdVariants = created.variants ?? [];
      for (const draft of input.variants) {
        const file = input.variantImages[keyForAttributes(draft.attributes)];
        if (!file) continue;
        const match = createdVariants.find(
          (variant) =>
            keyForAttributes(variant.attributes) ===
              keyForAttributes(draft.attributes),
        );
        if (!match) continue;
        await productsApi.uploadVariantImage(
          sid,
          created.id,
          match.id,
          file,
          input.fallbackErrorMessage,
        );
      }

      return created;
    },
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: productsKeys.byStore(storeId),
      });
    },
  });
}
