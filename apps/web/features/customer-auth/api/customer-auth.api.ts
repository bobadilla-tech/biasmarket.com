import { apiFetch } from "@/lib/api";
import { okResultSchema } from "../schemas/ok-result.schema";
import {
  customerProfileSchema,
  updateCustomerProfileResultSchema,
} from "../schemas/profile.schema";

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

  logout: async (slug: string) => {
    const data = await apiFetch(`/stores/${slug}/account/logout`, {
      method: "POST",
    });
    return okResultSchema.parse(data);
  },

  me: async (slug: string) => {
    const data = await apiFetch(`/stores/${slug}/account/me`);
    return customerProfileSchema.parse(data);
  },

  changePassword: async (
    slug: string,
    currentPassword: string,
    newPassword: string,
  ) => {
    const data = await apiFetch(`/stores/${slug}/account/change-password`, {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return okResultSchema.parse(data);
  },

  forgotPassword: async (slug: string, phone: string) => {
    const data = await apiFetch(`/stores/${slug}/account/forgot-password`, {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
    return okResultSchema.parse(data);
  },

  updateProfile: async (
    slug: string,
    dto: { name: string; email?: string; phone?: string },
  ) => {
    const data = await apiFetch(`/stores/${slug}/account/me`, {
      method: "PATCH",
      body: JSON.stringify(dto),
    });
    return updateCustomerProfileResultSchema.parse(data);
  },
};
