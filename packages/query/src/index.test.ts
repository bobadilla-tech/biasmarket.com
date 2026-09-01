import { expect, test } from "vitest";
import { createQueryClient } from "./index.js";

test("returns a QueryClient with the shared staleTime default", () => {
  const client = createQueryClient();
  const queryFn = async () => "data";
  const cache = client.getQueryCache();
  const query = cache.build(client, {
    queryKey: ["test"],
    queryFn,
  });
  expect(query.options.staleTime).toBe(30_000);
});