import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { ReactNode } from "react";

import { axe, expectNoA11yViolations } from "@/test-utils/axe";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";
import { Field } from "./field";
import { RadioCard, RadioCardGroup } from "./radio-card-group";

function renderWithMessages(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("Field", () => {
  test("associates labels, descriptions, and externally controlled errors", async () => {
    const { container } = renderWithMessages(
      <Field.Root invalid>
        <Field.Label>Correo electrónico</Field.Label>
        <Field.Control name="email" type="email" />
        <Field.Description>
          Usaremos este correo para contactarte.
        </Field.Description>
        <Field.Error match>Ingresa un correo válido.</Field.Error>
      </Field.Root>,
    );

    const input = screen.getByRole("textbox", { name: "Correo electrónico" });
    const describedBy =
      input.getAttribute("aria-describedby")?.split(" ") ?? [];

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy).toHaveLength(2);
    expect(new Set(describedBy).size).toBe(2);
    expect(describedBy.every((id) => container.querySelector(`#${id}`))).toBe(
      true,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Ingresa un correo válido.",
    );

    expectNoA11yViolations(await axe(container));
  });
});

describe("Dialog", () => {
  test("moves focus into the dialog, closes on Escape, and restores the trigger", async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <Dialog>
        <DialogTrigger>Open dialog</DialogTrigger>
        <DialogContent>
          <DialogTitle>Example dialog</DialogTitle>
          <p>Dialog content</p>
        </DialogContent>
      </Dialog>,
    );

    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Example dialog",
    });
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-slot")).toBe(
        "dialog-close",
      );
    });
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expectNoA11yViolations(await axe(dialog));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

describe("RadioCardGroup", () => {
  test("uses one tab stop and arrow keys select without selecting on focus", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = renderWithMessages(
      <RadioCardGroup
        aria-label="Delivery method"
        defaultValue="home"
        onValueChange={onValueChange}
      >
        <RadioCard value="home" aria-label="Home delivery">
          Home
        </RadioCard>
        <RadioCard value="pickup" aria-label="Pickup">
          Pickup
        </RadioCard>
      </RadioCardGroup>,
    );

    const home = screen.getByRole("radio", { name: "Home delivery" });
    const pickup = screen.getByRole("radio", { name: "Pickup" });
    pickup.focus();
    expect(onValueChange).not.toHaveBeenCalled();

    home.focus();
    await user.keyboard("{ArrowDown}");
    expect(onValueChange).toHaveBeenCalledWith("pickup", expect.anything());

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(
      screen
        .getAllByRole("radio")
        .filter((radio) => radio.getAttribute("tabindex") === "0"),
    ).toHaveLength(1);
    expectNoA11yViolations(await axe(container));
  });
});
