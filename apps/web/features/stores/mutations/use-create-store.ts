import { useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi } from "../api/stores.api";
import type { CreateStoreFormInput } from "../schemas/create-store.schema";

export function useCreateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      values,
      logoFile,
      genericErrorMessage,
      logoErrorMessage,
    }: {
      values: CreateStoreFormInput & { themeConfig: Record<string, unknown> };
      logoFile: File | null;
      genericErrorMessage?: string;
      logoErrorMessage?: string;
    }) => {
      const store = await storesApi.create(values, genericErrorMessage);
      if (logoFile) {
        await storesApi.uploadLogo(store.id, logoFile, logoErrorMessage);
      }
      return store;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores", "mine"] });
    },
  });
}
