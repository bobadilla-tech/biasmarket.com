import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { axe, expectNoA11yViolations } from "../../../test-utils/axe";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/",
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { customerAuth: { login } },
}));

const { CustomerLoginForm } = await import("./customer-login-form");

afterEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
});

test("labels the split phone control and announces submit errors", async () => {
  const { container } = renderWithProviders(
    <CustomerLoginForm slug="my-store" />,
  );

  expect(
    screen.getByLabelText("Teléfono (WhatsApp)").getAttribute("autocomplete"),
  ).toBe("tel");
  expect(screen.getByLabelText("Código de país")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: /ingresar/i }));
  await waitFor(() => {
    expect(document.activeElement?.getAttribute("id")).toBe(
      "customer-login-error-summary",
    );
  });
  expectNoA11yViolations(await axe(container));
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

  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );
  await user.type(screen.getByPlaceholderText("Contraseña"), "super-secret-1");
  await user.click(screen.getByRole("button", { name: /ingresar/i }));

  await waitFor(() => {
    expect(login).toHaveBeenCalledWith("my-store", {
      phone: "+51988888888",
      password: "super-secret-1",
    });
    expect(push).toHaveBeenCalledWith("/es/store/my-store/account");
  });
});

test("surfaces a root error on invalid credentials without redirecting", async () => {
  login.mockRejectedValueOnce(new Error("Teléfono o contraseña inválidos"));
  const user = userEvent.setup();
  renderWithProviders(<CustomerLoginForm slug="my-store" />);

  await user.type(
    screen.getByPlaceholderText("Teléfono (WhatsApp)"),
    "988888888",
  );
  await user.type(screen.getByPlaceholderText("Contraseña"), "wrong-password");
  await user.click(screen.getByRole("button", { name: /ingresar/i }));

  await waitFor(() => {
    expect(screen.getByText("Teléfono o contraseña inválidos")).toBeDefined();
  });
  expect(push).not.toHaveBeenCalled();
});

test("offers Google sign-in that starts the store-scoped buyer flow", () => {
  renderWithProviders(<CustomerLoginForm slug="my-store" />);

  const link = screen.getByRole("link", { name: "Continuar con Google" });
  expect(link.getAttribute("href")).toContain(
    "/api/stores/my-store/account/google?locale=",
  );
});

test("tells buyers who bought with their phone to sign in with it, next to the Google button", () => {
  renderWithProviders(<CustomerLoginForm slug="my-store" />);

  expect(
    screen.getByText(
      "Si compraste con tu teléfono, ingresa con tu teléfono para ver esos pedidos.",
    ),
  ).toBeDefined();
});

test("no longer maps the retired ambiguous Google error", () => {
  searchParams = new URLSearchParams("google=ambiguous");
  renderWithProviders(<CustomerLoginForm slug="my-store" />);

  expect(screen.queryByText(/Más de una cuenta usa ese correo/)).toBeNull();
});

test("the global login (no slug) starts the global Google flow and links to the global forgot-password page", () => {
  renderWithProviders(<CustomerLoginForm />);

  const link = screen.getByRole("link", { name: "Continuar con Google" });
  expect(link.getAttribute("href")).toContain("/api/account/google?locale=");
  expect(link.getAttribute("href")).not.toContain("/stores/");
  expect(
    screen.getByRole("link", { name: /olvidaste/i }).getAttribute("href"),
  ).toContain("/my-purchases/forgot-password");
});
