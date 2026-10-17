import { apiClient } from "@/lib/api-client";

export const referencesApi = {
  findAll: apiClient.storeReferences.findAll,
  remove: apiClient.storeReferences.remove,
  create: apiClient.storeReferences.create,
};
