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

const signInEmail = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: (...args: unknown[]) => signInEmail(...args) } },
}));

const listMine = vi.fn();
vi.mock("@/features/stores", () => ({
  storesApi: { listMine: (...args: unknown[]) => listMine(...args) },
}));

const { LoginForm } = await import("./login-form");

afterEach(() => {
  vi.clearAllMocks();
});

async function submitValidCredentials() {
  const user = userEvent.setup();
  renderWithProviders(<LoginForm />);
  await user.type(screen.getByPlaceholderText("Email"), "a@b.com");
  await user.type(screen.getByPlaceholderText("Contraseña"), "secret");
  await user.click(screen.getByRole("button", { name: /ingresar/i }));
}

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

test("redirects a seller with no stores to first-store onboarding", async () => {
  signInEmail.mockResolvedValueOnce({ data: { user: { role: "seller" } }, error: null });
  listMine.mockResolvedValueOnce([]);

  await submitValidCredentials();

  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/es/onboarding/create-store");
  });
});

test("redirects a returning single-store seller straight to their dashboard", async () => {
  signInEmail.mockResolvedValueOnce({ data: { user: { role: "seller" } }, error: null });
  listMine.mockResolvedValueOnce([{ id: "1", name: "Demo", slug: "demo-store", logoUrl: null }]);

  await submitValidCredentials();

  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/es/dashboard/demo-store");
  });
});

test("sends a multi-store seller to the account page", async () => {
  signInEmail.mockResolvedValueOnce({ data: { user: { role: "seller" } }, error: null });
  listMine.mockResolvedValueOnce([
    { id: "1", name: "Demo", slug: "demo-store", logoUrl: null },
    { id: "2", name: "Other", slug: "other-store", logoUrl: null },
  ]);

  await submitValidCredentials();

  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/es/account");
  });
});

test("admins skip the store lookup entirely and go to /admin", async () => {
  signInEmail.mockResolvedValueOnce({ data: { user: { role: "admin" } }, error: null });

  await submitValidCredentials();

  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/es/admin");
  });
  expect(listMine).not.toHaveBeenCalled();
});
