import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";
import { beforeEach, expect, test, vi } from "vitest";
import { BlogSection } from "./blog-section";

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      {children}
    </NextIntlClientProvider>
  );
}

const scrollBy = vi.fn();

beforeEach(() => {
  scrollBy.mockClear();
  // jsdom has no layout/scrolling — stub the method the arrows call, and
  // give elements a non-zero width so the computed scroll step isn't 0.
  HTMLElement.prototype.scrollBy = scrollBy;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 144,
  });
});

test("mobile carousel exposes two arrows with distinct accessible names", () => {
  render(
    <Wrapper>
      <BlogSection />
    </Wrapper>,
  );

  // getByRole throws if the button is missing or the name doesn't match.
  screen.getByRole("button", { name: "Anterior" });
  screen.getByRole("button", { name: "Siguiente" });
});

test('clicking "next" scrolls the strip forward, "prev" backward', async () => {
  const user = userEvent.setup();
  render(
    <Wrapper>
      <BlogSection />
    </Wrapper>,
  );

  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(scrollBy).toHaveBeenCalledTimes(1);
  expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "Anterior" }));
  expect(scrollBy).toHaveBeenCalledTimes(2);
  expect(scrollBy.mock.calls[1][0].left).toBeLessThan(0);
});
