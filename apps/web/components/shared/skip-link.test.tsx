import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test-utils/render-with-providers";
import { axe, expectNoA11yViolations } from "../../test-utils/axe";
import { SkipLink } from "./skip-link";

test("moves focus to the main landmark", async () => {
  const user = userEvent.setup();
  const { container } = renderWithProviders(
    <>
      <SkipLink />
      <main id="main-content" tabIndex={-1}>
        <h1>Page title</h1>
      </main>
    </>,
    "en",
  );

  await user.click(screen.getByRole("link", { name: "Skip to content" }));

  expect(document.activeElement).toBe(screen.getByRole("main"));
  expect(window.location.hash).toBe("#main-content");
  expectNoA11yViolations(await axe(container));
});
