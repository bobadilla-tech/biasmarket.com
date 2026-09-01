import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";
import { expect, test } from "vitest";
import { CategoriesSection } from "./categories-section";

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      {children}
    </NextIntlClientProvider>
  );
}

// Locks the a11y fix: the mobile carousel arrows previously both carried
// aria-label="Categorías" (the section title), so a screen reader announced
// the same name twice with no direction.
test("mobile carousel arrows have distinct directional accessible names", () => {
  render(
    <Wrapper>
      <CategoriesSection />
    </Wrapper>,
  );

  // getByRole throws if either directional button is missing.
  screen.getByRole("button", { name: "Anterior" });
  screen.getByRole("button", { name: "Siguiente" });
  expect(screen.queryByRole("button", { name: "Categorías" })).toBeNull();
});
