// Multipart upload is the one exception to the generated-client migration
// (see the OpenAPI note in apps/web/AGENTS.md): file uploads don't fit a
// JSON request body, so these two calls stay on plain `fetch` + `FormData`,
// exactly as they did before `apiClient.products.*` replaced the rest of
// this file's methods.
function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

async function uploadMultipart(
  url: string,
  file: File,
  fallbackErrorMessage?: string,
) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message ?? fallbackErrorMessage ?? "Network error");
  }
  return data;
}

async function apiDelete(url: string, fallbackErrorMessage?: string) {
  const res = await fetch(url, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message ?? fallbackErrorMessage ?? "Network error");
  }
  return data;
}

async function apiPatch(
  url: string,
  body: unknown,
  fallbackErrorMessage?: string,
) {
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message ?? fallbackErrorMessage ?? "Network error");
  }
  return data;
}

export const productsApi = {
  uploadImage(
    storeId: string,
    productId: string,
    file: File,
    options?: { replace?: boolean; fallbackErrorMessage?: string },
  ) {
    const query = options?.replace ? "?replace=1" : "";
    return uploadMultipart(
      `${apiUrl()}/api/stores/${storeId}/products/${productId}/images${query}`,
      file,
      options?.fallbackErrorMessage,
    );
  },

  uploadVariantImage(
    storeId: string,
    productId: string,
    variantId: string,
    file: File,
    fallbackErrorMessage?: string,
  ) {
    return uploadMultipart(
      `${apiUrl()}/api/stores/${storeId}/products/${productId}/variants/${variantId}/images`,
      file,
      fallbackErrorMessage,
    );
  },

  removeImage(
    storeId: string,
    productId: string,
    index: number,
    fallbackErrorMessage?: string,
  ) {
    return apiDelete(
      `${apiUrl()}/api/stores/${storeId}/products/${productId}/images/${index}`,
      fallbackErrorMessage,
    );
  },

  reorderImages(
    storeId: string,
    productId: string,
    images: string[],
    fallbackErrorMessage?: string,
  ) {
    return apiPatch(
      `${apiUrl()}/api/stores/${storeId}/products/${productId}/images/reorder`,
      { images },
      fallbackErrorMessage,
    );
  },
};
