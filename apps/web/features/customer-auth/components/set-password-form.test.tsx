import { afterEach, expect, test, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const register = vi.fn();
vi.mock("../api/customer-auth.api", () => ({
  customerAuthApi: { register: (...args: unknown[]) => register(...args) },
}));

const { SetPasswordForm } = await import("./set-password-form");

afterEach(() => {
  vi.clearAllMocks();
});

test("shows a validation error when the password is too short", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SetPasswordForm slug="my-store" token="tok" />);

  await user.type(screen.getByPlaceholderText("Contraseña (mín. 8 caracteres)"), "short");
  await user.type(screen.getByPlaceholderText("Confirmar contraseña"), "short");
  fireEvent.click(screen.getByRole("button", { name: /configurar contraseña/i }));

  await waitFor(() => {
    expect(screen.getByText("Debe tener al menos 8 caracteres")).toBeDefined();
  });
  expect(register).not.toHaveBeenCalled();
});

test("shows a validation error when passwords don't match", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SetPasswordForm slug="my-store" token="tok" />);

  await user.type(screen.getByPlaceholderText("Contraseña (mín. 8 caracteres)"), "super-secret-1");
  await user.type(screen.getByPlaceholderText("Confirmar contraseña"), "different-secret-1");
  fireEvent.click(screen.getByRole("button", { name: /configurar contraseña/i }));

  await waitFor(() => {
    expect(screen.getByText("Las contraseñas no coinciden")).toBeDefined();
  });
  expect(register).not.toHaveBeenCalled();
});

test("submits the token and password, then shows the success state", async () => {
  register.mockResolvedValueOnce({ ok: true });
  const user = userEvent.setup();
  renderWithProviders(<SetPasswordForm slug="my-store" token="tok" />);

  await user.type(screen.getByPlaceholderText("Contraseña (mín. 8 caracteres)"), "super-secret-1");
  await user.type(screen.getByPlaceholderText("Confirmar contraseña"), "super-secret-1");
  await user.click(screen.getByRole("button", { name: /configurar contraseña/i }));

  await waitFor(() => {
    expect(register).toHaveBeenCalledWith("my-store", "tok", "super-secret-1");
    expect(screen.getByText(/ya puedes ingresar/i)).toBeDefined();
  });
});

test("surfaces a root error on failure without showing the success state", async () => {
  register.mockRejectedValueOnce(new Error("Esta cuenta ya tiene una contraseña configurada"));
  const user = userEvent.setup();
  renderWithProviders(<SetPasswordForm slug="my-store" token="tok" />);

  await user.type(screen.getByPlaceholderText("Contraseña (mín. 8 caracteres)"), "super-secret-1");
  await user.type(screen.getByPlaceholderText("Confirmar contraseña"), "super-secret-1");
  await user.click(screen.getByRole("button", { name: /configurar contraseña/i }));

  await waitFor(() => {
    expect(screen.getByText("Esta cuenta ya tiene una contraseña configurada")).toBeDefined();
  });
});
