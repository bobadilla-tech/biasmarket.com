import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { axe, expectNoA11yViolations } from "../../../test-utils/axe";

const signInSocial = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { social: (...args: unknown[]) => signInSocial(...args) },
  },
}));

const { AuthErrorScreen } = await import("./auth-error-screen");

afterEach(() => {
  vi.clearAllMocks();
});

test("explains a cancelled Google sign-in and offers to retry, as an accessible alert", async () => {
  const { container } = renderWithProviders(
    <AuthErrorScreen code="access_denied" />,
  );

  expect(screen.getByRole("alert")).toBeDefined();
  expect(
    screen.getByRole("heading", {
      name: "Cancelaste el inicio de sesión con Google",
    }),
  ).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Intentar de nuevo con Google" }),
  ).toBeDefined();
  expectNoA11yViolations(await axe(container));
});

test("an existing-account error points to the email login and contact, without a Google retry", () => {
  renderWithProviders(<AuthErrorScreen code="account_not_linked" />);

  expect(
    screen.getByRole("heading", { name: "Este correo ya tiene una cuenta" }),
  ).toBeDefined();
  expect(screen.queryByRole("button", { name: /con Google/ })).toBeNull();
  expect(
    screen.getByRole("link", { name: "Ingresar con correo y contraseña" }),
  ).toBeDefined();
  expect(screen.getByRole("link", { name: "Contáctanos" })).toBeDefined();
});

test("an unknown code shows the generic screen and never the raw code", () => {
  renderWithProviders(<AuthErrorScreen code="weird_internal_code_123" />);

  expect(screen.getByRole("heading", { name: "Algo salió mal" })).toBeDefined();
  expect(screen.queryByText(/weird_internal_code_123/)).toBeNull();
});

test("retrying restarts the Google flow with the error screen as the failure target", async () => {
  signInSocial.mockResolvedValueOnce({ error: null });
  const user = userEvent.setup();
  renderWithProviders(<AuthErrorScreen code="expired" />);

  await user.click(
    screen.getByRole("button", { name: "Intentar de nuevo con Google" }),
  );

  await waitFor(() => {
    expect(signInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        callbackURL: expect.stringContaining("/verify-email"),
        errorCallbackURL: expect.stringContaining("/auth/error"),
      }),
    );
  });
});
