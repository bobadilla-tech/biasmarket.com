import { apiClient } from "@/lib/api-client";

function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

async function sendMultipart(
  url: string,
  method: "POST" | "PATCH",
  values: {
    file?: File;
    takenAt?: string;
    caption?: string;
    hidden?: boolean;
    privacyConfirmed?: boolean;
    width?: number;
    height?: number;
  },
  fallbackErrorMessage?: string,
) {
  const body = new FormData();
  if (values.file) body.append("file", values.file);
  if (values.takenAt) body.append("takenAt", values.takenAt);
  if (values.caption !== undefined) body.append("caption", values.caption);
  if (values.hidden !== undefined) body.append("hidden", String(values.hidden));
  if (values.privacyConfirmed !== undefined) {
    body.append("privacyConfirmed", String(values.privacyConfirmed));
  }
  if (values.width !== undefined) body.append("width", String(values.width));
  if (values.height !== undefined) body.append("height", String(values.height));

  const response = await fetch(url, {
    method,
    credentials: "include",
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message ?? fallbackErrorMessage ?? "Network error");
  }
  return data;
}

export const referencesApi = {
  findAll: apiClient.storeReferences.findAll,
  remove: apiClient.storeReferences.remove,
  create(
    storeId: string,
    values: Parameters<typeof sendMultipart>[2] & {
      file: File;
      takenAt: string;
      width: number;
      height: number;
    },
    fallbackErrorMessage?: string,
  ) {
    return sendMultipart(
      `${apiUrl()}/api/stores/${storeId}/references`,
      "POST",
      values,
      fallbackErrorMessage,
    );
  },
  update(
    storeId: string,
    referenceId: string,
    values: Parameters<typeof sendMultipart>[2],
    fallbackErrorMessage?: string,
  ) {
    return sendMultipart(
      `${apiUrl()}/api/stores/${storeId}/references/${referenceId}`,
      "PATCH",
      values,
      fallbackErrorMessage,
    );
  },
};
