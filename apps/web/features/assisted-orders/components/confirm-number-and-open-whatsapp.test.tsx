import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { ConfirmNumberAndOpenWhatsApp } from "./confirm-number-and-open-whatsapp";

afterEach(() => {
  vi.restoreAllMocks();
});

function setup() {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const onFixNumber = vi.fn();
  renderWithProviders(
    <ConfirmNumberAndOpenWhatsApp
      phone="+51987654321"
      message="¡Hola Sofi! 💜 https://biasmarket.com/es/store/k/pedido/tok"
      onFixNumber={onFixNumber}
    />,
  );
  return { open, onFixNumber, user: userEvent.setup() };
}

test("asks to confirm the formatted number before opening anything", async () => {
  const { open, user } = setup();
  await user.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  expect(
    await screen.findByText("Se enviará a +51 987 654 321. ¿Es correcto?"),
  ).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
});

test("confirming opens the wa.me chat for that number with the message, without leaking the opener", async () => {
  const { open, user } = setup();
  await user.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  await user.click(
    await screen.findByRole("button", { name: "Sí, abrir WhatsApp" }),
  );
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(
    `https://wa.me/51987654321?text=${encodeURIComponent(
      "¡Hola Sofi! 💜 https://biasmarket.com/es/store/k/pedido/tok",
    )}`,
    "_blank",
    "noopener,noreferrer",
  );
});

test("Corregir número goes to the order instead of opening WhatsApp", async () => {
  const { open, onFixNumber, user } = setup();
  await user.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  await user.click(
    await screen.findByRole("button", { name: "Corregir número" }),
  );
  expect(onFixNumber).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
});
