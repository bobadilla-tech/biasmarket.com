import { z } from "zod";

// better-auth's admin client already returns typed data for
// listUsers/banUser/unbanUser — those stay direct authClient calls, not
// zod-validated. Only /admin/users/store-counts goes through apiFetch and
// needs a schema.
export const storeCountSchema = z.object({ userId: z.string(), storeCount: z.number() });
export const storeCountListSchema = z.array(storeCountSchema);

export type StoreCount = z.infer<typeof storeCountSchema>;

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role?: string | null;
  banned?: boolean | null;
}
