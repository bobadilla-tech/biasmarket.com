import { apiFetch } from "@/lib/api";
import { okResultSchema } from "../schemas/ok-result.schema";

export const customerAuthApi = {
  register: async (slug: string, token: string, password: string) => {
    const data = await apiFetch(`/stores/${slug}/account/register`, {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    return okResultSchema.parse(data);
  },

  login: async (slug: string, phone: string, password: string) => {
    const data = await apiFetch(`/stores/${slug}/account/login`, {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    });
    return okResultSchema.parse(data);
  },
};
