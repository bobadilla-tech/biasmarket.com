import * as bcrypt from "bcrypt";
  
export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const comparePassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash);

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
