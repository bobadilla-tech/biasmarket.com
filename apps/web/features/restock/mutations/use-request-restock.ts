"use client";

import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { RestockRequestPayload } from "../schemas/restock-request.schema";

export function useRequestRestock(slug: string) {
  return useMutation({
    mutationFn: (payload: RestockRequestPayload) =>
      apiClient.restock.create(slug, payload),
  });
}
