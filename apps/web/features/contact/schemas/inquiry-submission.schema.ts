import { z } from "zod";

// Independent from features/admin's inquirySchema on purpose — that one
// describes the authenticated read/review shape (includes status/createdAt);
// this describes the public create payload only. Don't couple a marketing
// component to an admin-only feature by .pick()-ing from the other schema.
export const inquirySubmissionSchema = z.object({
  name: z.string().min(1, "name required"),
  email: z.string().email("invalid email"),
  company: z.string(),
  inquiryType: z.enum(["general", "technical", "pricing", "partnership", "other"]),
  message: z.string().min(1, "message required"),
});

export type InquirySubmissionInput = z.infer<typeof inquirySubmissionSchema>;
