// better-auth's admin client already returns typed data for
// listUsers/banUser/unbanUser — those stay direct authClient calls, not
// validated against a generated type. Only /admin/users/store-counts goes
// through the generated Users client.
export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role?: string | null;
  banned?: boolean | null;
}
