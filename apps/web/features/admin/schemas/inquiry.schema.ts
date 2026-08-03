import { z } from "zod";

export const inquirySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  company: z.string().nullable(),
  inquiryType: z.string().nullable(),
  message: z.string(),
  status: z.enum(["NEW", "REVIEWED", "ARCHIVED"]),
  createdAt: z.string(),
});

export const inquiryListSchema = z.array(inquirySchema);

export type Inquiry = z.infer<typeof inquirySchema>;
