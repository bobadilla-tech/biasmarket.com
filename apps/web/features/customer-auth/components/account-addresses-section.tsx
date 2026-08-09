"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shared/loading-state";
import { EmptyState } from "@/components/shared/empty-state";
import { useAddresses } from "../queries/use-addresses";
import { useCreateAddress } from "../mutations/use-create-address";
import { useUpdateAddress } from "../mutations/use-update-address";
import { useDeleteAddress } from "../mutations/use-delete-address";
import { AddressForm } from "./address-form";
import type { AddressResponseDto } from "@biasmarket/types";
import type { AddressInput } from "../schemas/address.schema";

type PanelState = { mode: "list" } | { mode: "add" } | {
  mode: "edit";
  address: AddressResponseDto;
};

export function AccountAddressesSection({ slug }: { slug: string }) {
  const t = useTranslations("storefront.accountPage.addresses");
  const { data: addresses, isPending } = useAddresses(slug);
  const createAddress = useCreateAddress(slug);
  const updateAddress = useUpdateAddress(slug);
  const deleteAddress = useDeleteAddress(slug);

  const [panel, setPanel] = useState<PanelState>({ mode: "list" });
  const [pendingDelete, setPendingDelete] = useState<AddressResponseDto | null>(
    null,
  );

  const handleCreate = async (values: AddressInput) => {
    await createAddress.mutateAsync(values);
    setPanel({ mode: "list" });
  };

  const handleUpdate = async (id: string, values: AddressInput) => {
    await updateAddress.mutateAsync({ id, dto: values });
    setPanel({ mode: "list" });
  };

  const handleSetDefault = (address: AddressResponseDto) => {
    updateAddress.mutate({ id: address.id, dto: { isDefault: true } });
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    await deleteAddress.mutateAsync(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
        {panel.mode === "list" && (
          <button
            type="button"
            onClick={() => setPanel({ mode: "add" })}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <Plus className="size-4" />
            {t("addNew")}
          </button>
        )}
      </div>

      {panel.mode === "add" && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <AddressForm
            submitting={createAddress.isPending}
            onSubmit={handleCreate}
            onCancel={() => setPanel({ mode: "list" })}
          />
        </div>
      )}

      {panel.mode === "edit" && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <AddressForm
            defaultValues={{
              label: panel.address.label ?? undefined,
              recipientName: panel.address.recipientName,
              phone: panel.address.phone,
              line1: panel.address.line1,
              line2: panel.address.line2 ?? undefined,
              city: panel.address.city,
              region: panel.address.region ?? undefined,
              reference: panel.address.reference ?? undefined,
            }}
            submitting={updateAddress.isPending}
            onSubmit={(values) => handleUpdate(panel.address.id, values)}
            onCancel={() => setPanel({ mode: "list" })}
          />
        </div>
      )}

      {panel.mode === "list" && (
        isPending
          ? <LoadingState variant="inline" rows={2} />
          : !addresses || addresses.length === 0
          ? (
            <EmptyState
              icon={MapPin}
              message={t("empty")}
            />
          )
          : (
            <div className="flex flex-col gap-3">
              {addresses.map((address) => (
                <div
                  key={address.id}
                  className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {address.label || address.recipientName}
                      </p>
                      {address.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                          <Star className="size-3" />
                          {t("default")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {address.recipientName} · {address.phone}
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ""}
                    </p>
                    <p className="text-sm text-gray-700">
                      {address.city}
                      {address.region ? `, ${address.region}` : ""}
                    </p>
                    {address.reference && (
                      <p className="text-xs text-gray-500">
                        {address.reference}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!address.isDefault && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(address)}
                        disabled={updateAddress.isPending}
                      >
                        {t("setDefault")}
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPanel({ mode: "edit", address })}
                      aria-label={t("edit")}
                      className="flex size-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition hover:bg-gray-50"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(address)}
                      aria-label={t("delete")}
                      className="flex size-9 items-center justify-center rounded-xl border border-gray-200 text-red-500 transition hover:bg-red-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteAddress.isPending}
            >
              {t("delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
