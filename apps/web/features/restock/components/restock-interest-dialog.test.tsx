import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";
import { afterEach, expect, test, vi } from "vitest";
import { axe, expectNoA11yViolations } from "../../../test-utils/axe";

const mutationState = vi.hoisted(() => ({
  isSuccess: false,
  isPending: false,
  error: null as Error | null,
  mutateAsync: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("../mutations/use-request-restock", () => ({
  useRequestRestock: () => mutationState,
}));

const { RestockInterestDialog } = await import("./restock-interest-dialog");

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderDialog(open: boolean, onOpenChange = vi.fn()) {
  const triggerRef = { current: null } as React.RefObject<HTMLElement | null>;
  const { rerender } = render(
    <Wrapper>
      <button
        type="button"
        ref={(element) => {
          triggerRef.current = element;
        }}
      >
        Register interest
      </button>
      <RestockInterestDialog
        open={open}
        onOpenChange={onOpenChange}
        triggerRef={triggerRef}
        slug="store"
        productId="product"
        productName="Photocard set"
      />
    </Wrapper>,
  );
  return { rerender, onOpenChange, triggerRef };
}

afterEach(() => {
  mutationState.isSuccess = false;
  mutationState.isPending = false;
  mutationState.error = null;
  mutationState.mutateAsync.mockReset();
  mutationState.reset.mockReset();
});

test("has a named modal, traps focus, and restores the interest trigger on Escape", async () => {
  const user = userEvent.setup();
  const { rerender, onOpenChange, triggerRef } = renderDialog(false);
  triggerRef.current?.focus();

  rerender(
    <Wrapper>
      <button
        type="button"
        ref={(element) => {
          triggerRef.current = element;
        }}
      >
        Register interest
      </button>
      <RestockInterestDialog
        open
        onOpenChange={onOpenChange}
        triggerRef={triggerRef}
        slug="store"
        productId="product"
        productName="Photocard set"
      />
    </Wrapper>,
  );

  const dialog = await screen.findByRole("dialog", {
    name: "Avisarme cuando haya stock",
  });
  expect(screen.getByRole("textbox", { name: "Nombre" })).toBeDefined();
  expectNoA11yViolations(await axe(dialog));

  await user.keyboard("{Escape}");
  expect(onOpenChange).toHaveBeenCalledWith(false);

  rerender(
    <Wrapper>
      <button
        type="button"
        ref={(element) => {
          triggerRef.current = element;
        }}
      >
        Register interest
      </button>
      <RestockInterestDialog
        open={false}
        onOpenChange={onOpenChange}
        triggerRef={triggerRef}
        slug="store"
        productId="product"
        productName="Photocard set"
      />
    </Wrapper>,
  );

  await waitFor(() => expect(document.activeElement).toBe(triggerRef.current));
});

test("announces and focuses the confirmation heading after a successful request", async () => {
  mutationState.isSuccess = true;
  const { triggerRef } = renderDialog(true);

  const heading = await screen.findByRole("heading", {
    name: "¡Estás en la lista!",
  });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(screen.getByRole("status").textContent).toContain(
    "¡Estás en la lista!",
  );
  expect(triggerRef.current).toBeDefined();
});
