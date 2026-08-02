import { afterEach, expect, test, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

const login = vi.fn();
vi.mock("../api/customer-auth.api", () => ({
  customerAuthApi: { login: (...args: unknown[]) => login(...args) },
}));

const { CustomerLoginForm } = await import("./customer-login-form");

afterEach(() => {
  vi.clearAllMocks();
});

test("shows validation errors when submitted empty", async () => {
  renderWithProviders(<CustomerLoginForm slug="my-store" />);

  fireEvent.click(screen.getByRole("button", { name: /ingresar/i }));

  await waitFor(() => {
    expect(screen.getByText("Ingresa tu número de teléfono")).toBeDefined();
    expect(screen.getByText("Ingresa tu contraseña")).toBeDefined();
  });
  expect(login).not.toHaveBeenCalled();
});

test("submits valid credentials and redirects to the profile page on success", async () => {
  login.mockResolvedValueOnce({ ok: true });
  const user = userEvent.setup();
  renderWithProviders(<CustomerLoginForm slug="my-store" />);

  await user.type(screen.getByPlaceholderText("Teléfono (WhatsApp)"), "+51988888888");
  await user.type(screen.getByPlaceholderText("Contraseña"), "super-secret-1");
  await user.click(screen.getByRole("button", { name: /ingresar/i }));

  await waitFor(() => {
    expect(login).toHaveBeenCalledWith("my-store", "+51988888888", "super-secret-1");
    expect(push).toHaveBeenCalledWith("/es/store/my-store/account");
  });
});

test("surfaces a root error on invalid credentials without redirecting", async () => {
  login.mockRejectedValueOnce(new Error("Teléfono o contraseña inválidos"));
  const user = userEvent.setup();
  renderWithProviders(<CustomerLoginForm slug="my-store" />);

  await user.type(screen.getByPlaceholderText("Teléfono (WhatsApp)"), "+51988888888");
  await user.type(screen.getByPlaceholderText("Contraseña"), "wrong-password");
  await user.click(screen.getByRole("button", { name: /ingresar/i }));

  await waitFor(() => {
    expect(screen.getByText("Teléfono o contraseña inválidos")).toBeDefined();
  });
  expect(push).not.toHaveBeenCalled();
});
