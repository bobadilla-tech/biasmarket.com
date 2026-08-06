"use client";

import { useMutation } from "@tanstack/react-query";
import { restockApi } from "../api/restock.api";
import type { RestockRequestPayload } from "../schemas/restock-request.schema";

export function useRequestRestock(slug: string) {
  return useMutation({
    mutationFn: (payload: RestockRequestPayload) =>
      restockApi.request(slug, payload),
  });
}
