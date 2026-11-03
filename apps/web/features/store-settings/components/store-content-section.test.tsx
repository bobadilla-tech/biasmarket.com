import { expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import type { DashboardStore } from "@/features/stores";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: () => ({ slug: "test-store" }),
}));

const { updateStore } = vi.hoisted(() => ({ updateStore: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { stores: { update: updateStore } },
}));

const { StoreContentSection } = await import("./store-content-section");

test("updates the store preview callback when the bio draft changes", async () => {
  const onPreviewChange = vi.fn();
  const store = {
    id: "store-1",
    slug: "test-store",
    name: "Test store",
    bio: "Saved bio",
    aboutMarkdown: "",
  } as DashboardStore;

  renderWithProviders(
    <StoreContentSection store={store} onPreviewChange={onPreviewChange} />,
  );

  fireEvent.change(screen.getByLabelText("Bio"), {
    target: { value: "Draft bio" },
  });

  await waitFor(() =>
    expect(onPreviewChange).toHaveBeenLastCalledWith({ bio: "Draft bio" }),
  );
});
