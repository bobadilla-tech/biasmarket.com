import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { ClaimErrorBanner } from "./claim-error-banner";

test("renders nothing without a claim code", () => {
  const { container } = renderWithProviders(
    <ClaimErrorBanner code={undefined} />,
  );
  expect(container.textContent).toBe("");
});

test.each([
  ["already_claimed", /ya fue guardado en otra cuenta/],
  ["not_claimable", /todavía no se puede guardar/],
  ["invalid", /venció o ya no es válido/],
  ["failed", /No pudimos guardar tu pedido/],
  ["unavailable", /no está disponible por ahora/],
])("shows the message for %s", (code, text) => {
  renderWithProviders(<ClaimErrorBanner code={code} />);
  expect(screen.getByRole("alert").textContent).toMatch(text);
});

test("an unknown or hostile code gets the generic message and is never echoed", () => {
  renderWithProviders(<ClaimErrorBanner code="<script>alert(1)</script>" />);
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toMatch(/No pudimos guardar tu pedido/);
  expect(alert.innerHTML).not.toContain("script");
});

test("renders in English too", () => {
  renderWithProviders(<ClaimErrorBanner code="already_claimed" />, "en");
  expect(screen.getByRole("alert").textContent).toMatch(
    /already saved to another account/,
  );
});
