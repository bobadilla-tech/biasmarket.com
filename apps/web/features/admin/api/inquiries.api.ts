import { apiFetch } from "@/lib/api";
import { inquiryListSchema } from "../schemas/inquiry.schema";

export const inquiriesApi = {
  async list(fallbackErrorMessage?: string) {
    const data = await apiFetch("/contact", {}, fallbackErrorMessage);
    return inquiryListSchema.parse(data);
  },

  markReviewed(id: string, fallbackErrorMessage?: string) {
    return apiFetch(`/contact/${id}/review`, { method: "PATCH" }, fallbackErrorMessage);
  },
};
