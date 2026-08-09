import { vi, test } from "vitest";
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "es" }) }));
test("probe", async () => {
  await import("@/features/stats");
});
