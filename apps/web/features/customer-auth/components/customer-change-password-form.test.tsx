import { afterEach, expect, test, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const changePassword = vi.fn();
vi.mock("../api/customer-auth.api", () => ({
  customerAuthApi: { changePassword: (...args: unknown[]) => changePassword(...args) },
}));

const { CustomerChangePasswordForm } = await import("./customer-change-password-form");

afterEach(() => {
  vi.clearAllMocks();
});

test("shows a validation error when the new password is too short", async () => {
  const user = userEvent.setup();
  renderWithProviders(<CustomerChangePasswordForm slug="my-store" />);

  await user.type(screen.getByPlaceholderText("Contraseña actual"), "old-secret-1");
  await user.type(screen.getByPlaceholderText("Nueva contraseña (mín. 8 caracteres)"), "short");
  await user.type(screen.getByPlaceholderText("Confirmar nueva contraseña"), "short");
  fireEvent.click(screen.getByRole("button", { name: /actualizar contraseña/i }));

  await waitFor(() => {
    expect(screen.getByText("Debe tener al menos 8 caracteres")).toBeDefined();
  });
  expect(changePassword).not.toHaveBeenCalled();
});

test("submits current and new password, then shows the success message", async () => {
  changePassword.mockResolvedValueOnce({ ok: true });
  const user = userEvent.setup();
  renderWithProviders(<CustomerChangePasswordForm slug="my-store" />);

  await user.type(screen.getByPlaceholderText("Contraseña actual"), "old-secret-1");
  await user.type(screen.getByPlaceholderText("Nueva contraseña (mín. 8 caracteres)"), "new-secret-1");
  await user.type(screen.getByPlaceholderText("Confirmar nueva contraseña"), "new-secret-1");
  await user.click(screen.getByRole("button", { name: /actualizar contraseña/i }));

  await waitFor(() => {
    expect(changePassword).toHaveBeenCalledWith("my-store", "old-secret-1", "new-secret-1");
    expect(screen.getByText("Contraseña actualizada.")).toBeDefined();
  });
});

test("surfaces a root error on the wrong current password", async () => {
  changePassword.mockRejectedValueOnce(new Error("Contraseña actual incorrecta"));
  const user = userEvent.setup();
  renderWithProviders(<CustomerChangePasswordForm slug="my-store" />);

  await user.type(screen.getByPlaceholderText("Contraseña actual"), "wrong-1");
  await user.type(screen.getByPlaceholderText("Nueva contraseña (mín. 8 caracteres)"), "new-secret-1");
  await user.type(screen.getByPlaceholderText("Confirmar nueva contraseña"), "new-secret-1");
  await user.click(screen.getByRole("button", { name: /actualizar contraseña/i }));

  await waitFor(() => {
    expect(screen.getByText("Contraseña actual incorrecta")).toBeDefined();
  });
});
