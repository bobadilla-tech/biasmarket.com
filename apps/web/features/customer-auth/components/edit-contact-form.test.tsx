import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const updateProfile = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: { customerAuth: { updateMe: updateProfile } },
}));

const { EditContactForm } = await import("./edit-contact-form");

const profile = {
  customer: {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "+51988888888",
    emailVerified: true,
    pendingEmail: null,
    pendingPhone: null,
  },
  orders: [],
};

afterEach(() => {
  vi.clearAllMocks();
});

test("prefills the form with the current profile values and submits changes", async () => {
  updateProfile.mockResolvedValueOnce({
    name: "Jane Doe",
    pendingEmail: "new@example.com",
    pendingPhone: null,
  });
  const user = userEvent.setup();
  renderWithProviders(<EditContactForm slug="my-store" profile={profile} />);

  const emailInput = screen.getByPlaceholderText(
    "Correo",
  ) as HTMLInputElement;
  expect(emailInput.value).toBe("jane@example.com");

  await user.clear(emailInput);
  await user.type(emailInput, "new@example.com");
  await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

  await waitFor(() => {
    expect(updateProfile).toHaveBeenCalledWith("my-store", {
      name: "Jane Doe",
      email: "new@example.com",
      phone: "+51988888888",
    });
    expect(screen.getByText("Revisa tu correo para confirmar los cambios."))
      .toBeDefined();
  });
});

test("changing the phone via PhoneInput submits the new national number under the existing dial code", async () => {
  updateProfile.mockResolvedValueOnce({
    name: "Jane Doe",
    pendingEmail: null,
    pendingPhone: "+51900000001",
  });
  const user = userEvent.setup();
  renderWithProviders(<EditContactForm slug="my-store" profile={profile} />);

  const phoneInput = screen.getByPlaceholderText(
    "Teléfono (WhatsApp)",
  ) as HTMLInputElement;
  expect(phoneInput.value).toBe("988888888");

  await user.clear(phoneInput);
  await user.type(phoneInput, "900000001");
  await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

  await waitFor(() => {
    expect(updateProfile).toHaveBeenCalledWith("my-store", {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+51900000001",
    });
  });
});

test("shows a pending-confirmation notice when a change is already staged", () => {
  renderWithProviders(
    <EditContactForm
      slug="my-store"
      profile={{
        ...profile,
        customer: { ...profile.customer, pendingEmail: "staged@example.com" },
      }}
    />,
  );

  expect(screen.getByText(/staged@example\.com/)).toBeDefined();
});
