import { apiFetch } from "@/lib/api";
import { storeSectionListSchema } from "../schemas/section.schema";
import type { SectionFormInput } from "../schemas/section.schema";

function buildContent(values: SectionFormInput): Record<string, unknown> {
  if (values.type === "BANNER") {
    return { imageUrl: values.imageUrl, linkUrl: values.linkUrl || undefined };
  }
  if (values.type === "TEXT_BLOCK") {
    return { body: values.body };
  }
  return {};
}

export const sectionsApi = {
  async list(storeId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(`/stores/${storeId}/sections`, {}, fallbackErrorMessage);
    return storeSectionListSchema.parse(data);
  },

  create(storeId: string, values: SectionFormInput, fallbackErrorMessage?: string) {
    return apiFetch(
      `/stores/${storeId}/sections`,
      {
        method: "POST",
        body: JSON.stringify({
          type: values.type,
          collectionId: values.type === "COLLECTION" ? values.collectionId : undefined,
          content: buildContent(values),
        }),
      },
      fallbackErrorMessage,
    );
  },

  remove(storeId: string, sectionId: string, fallbackErrorMessage?: string) {
    return apiFetch(
      `/stores/${storeId}/sections/${sectionId}`,
      { method: "DELETE" },
      fallbackErrorMessage,
    );
  },

  reorder(storeId: string, sectionIds: string[], fallbackErrorMessage?: string) {
    return apiFetch(
      `/stores/${storeId}/sections/reorder`,
      { method: "PATCH", body: JSON.stringify({ sectionIds }) },
      fallbackErrorMessage,
    );
  },
};
