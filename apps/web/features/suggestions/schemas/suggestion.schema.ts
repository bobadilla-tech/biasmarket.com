import { z } from "zod";

export const suggestionSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  titleKey: z.string(),
  bodyParams: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const suggestionListSchema = z.array(suggestionSchema);

export type Suggestion = z.infer<typeof suggestionSchema>;
