import { z } from "zod";
import type { RestockRequestResponseDto } from "@biasmarket/types";

export const restockRequestFormSchema = z.object({
  name: z.string().min(1, "name required"),
  phone: z.string().min(1, "phone required"),
});

export type RestockRequestFormInput = z.infer<typeof restockRequestFormSchema>;

export type RestockRequestPayload = {
  name: string;
  phone: string;
  productId: string;
  variantId?: string;
};

// Response shape for the restock-requests list — aliased onto the generated
// OpenAPI DTO instead of a hand-written zod schema (the fetch layer is the
// generated `apiClient.restock.*`, so response validation is the server's
// documented contract, not a runtime check). See apps/web/AGENTS.md's
// OpenAPI note on the pass-through-read split.
export type RestockRequest = RestockRequestResponseDto;
