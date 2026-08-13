import { createClient } from "next-sanity";

export const client = createClient({
  projectId: "n5geyqv5",
  dataset: "production",
  apiVersion: "2026-08-13",
  useCdn: true,
});
