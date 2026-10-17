import { randomInt } from "node:crypto";

// Each flow needs its own buyer: the API keys customers and buyer accounts by
// phone, and the seller route allows 5 distinct phones per store per 10 min.
// Random 8 digits after `9` (Peru mobile) so repeated runs and workers never
// collide. Returns the number as a person types it and as the API stores it.
export function uniquePhone(): { national: string; e164: string } {
  const national = `9${String(randomInt(1e8)).padStart(8, "0")}`;
  return { national, e164: `+51${national}` };
}
