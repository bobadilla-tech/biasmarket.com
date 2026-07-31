import { expect, test, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

const signInEmail = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: (...args: unknown[]) => signInEmail(...args) } },
}));

const { LoginForm } = await import("./login-form");

test("shows validation errors when submitted empty", async () => {
  renderWithProviders(<LoginForm />);

  fireEvent.click(screen.getByRole("button", { name: /ingresar/i }));

  await waitFor(() => {
    expect(screen.getByText("Ingresá un email válido")).toBeDefined();
    expect(screen.getByText("Ingresá tu contraseña")).toBeDefined();
  });
  expect(signInEmail).not.toHaveBeenCalled();
});

test("submits valid credentials and surfaces a root error on failure", async () => {
  signInEmail.mockResolvedValueOnce({ data: null, error: { message: "Bad credentials" } });
  const user = userEvent.setup();
  renderWithProviders(<LoginForm />);

  await user.type(screen.getByPlaceholderText("Email"), "a@b.com");
  await user.type(screen.getByPlaceholderText("Contraseña"), "secret");
  await user.click(screen.getByRole("button", { name: /ingresar/i }));

  await waitFor(() => {
    expect(screen.getByText("Bad credentials")).toBeDefined();
  });
  expect(signInEmail).toHaveBeenCalledWith({ email: "a@b.com", password: "secret" });
});
