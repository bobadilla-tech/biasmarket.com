import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const forgotPassword = vi.fn();
vi.mock("../api/customer-auth.api", () => ({
  customerAuthApi: {
    forgotPassword: (...args: unknown[]) => forgotPassword(...args),
  },
}));

const { ForgotPasswordForm } = await import("./forgot-password-form");

afterEach(() => {
  vi.clearAllMocks();
});

test("shows a validation error when the phone is empty", async () => {
  renderWithProviders(<ForgotPasswordForm slug="my-store" />);

  fireEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));

  await waitFor(() => {
    expect(screen.getByText("Ingresa tu número de teléfono")).toBeDefined();
  });
  expect(forgotPassword).not.toHaveBeenCalled();
});

test("submits the phone and shows the generic success message", async () => {
  forgotPassword.mockResolvedValueOnce({ ok: true });
  const user = userEvent.setup();
  renderWithProviders(<ForgotPasswordForm slug="my-store" />);

  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "+51988888888",
  );
  await user.click(screen.getByRole("button", { name: /enviar enlace/i }));

  await waitFor(() => {
    expect(forgotPassword).toHaveBeenCalledWith("my-store", "+51988888888");
    expect(screen.getByText(/revisa tu correo para continuar/i)).toBeDefined();
  });
});
