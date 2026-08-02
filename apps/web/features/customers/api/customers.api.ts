import { apiFetch } from "@/lib/api";
import { customerListSchema, customerDetailSchema } from "../schemas/customer.schema";

export const customersApi = {
  async list(storeId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(`/stores/${storeId}/customers`, {}, fallbackErrorMessage);
    return customerListSchema.parse(data);
  },
  async getOne(storeId: string, customerId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(`/stores/${storeId}/customers/${customerId}`, {}, fallbackErrorMessage);
    return customerDetailSchema.parse(data);
  },
};
