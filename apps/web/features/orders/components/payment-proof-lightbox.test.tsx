import { expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";
import { axe, expectNoA11yViolations } from "../../../test-utils/axe";
import type { ReactNode } from "react";
import { PaymentProofLightbox } from "./payment-proof-lightbox";

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderLightbox(ui: ReactNode) {
  return render(ui, { wrapper: Wrapper });
}

test("traps focus, announces the proof, and restores the trigger on Escape", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const { container, rerender } = renderLightbox(
    <>
      <button type="button">Review proof</button>
      <PaymentProofLightbox url={null} onClose={onClose} />
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Review proof" });
  trigger.focus();

  rerender(
    <>
      <button type="button">Review proof</button>
      <PaymentProofLightbox
        url="https://cdn.biasmarket.com/payment-proof.jpg"
        onClose={onClose}
      />
    </>,
  );

  const dialog = await screen.findByRole("dialog", {
    name: "Vista previa del comprobante de pago",
  });
  expect(
    screen.getByRole("img", {
      name: "Vista previa del comprobante de pago",
    }),
  ).toBeDefined();
  await waitFor(() => {
    expect(document.activeElement?.getAttribute("data-slot")).toBe(
      "dialog-close",
    );
  });
  expectNoA11yViolations(await axe(dialog));

  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
  rerender(
    <>
      <button type="button">Review proof</button>
      <PaymentProofLightbox url={null} onClose={onClose} />
    </>,
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement?.textContent).toBe("Review proof");
  expect(container).toBeDefined();
});
