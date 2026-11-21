import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { makeOrder, makePayment, TOKEN } from "../test-fixtures";

const { submitProof } = vi.hoisted(() => ({ submitProof: vi.fn() }));
vi.mock("../api/submit-proof", () => ({ submitProof }));

const { ProofUploadForm } = await import("./proof-upload-form");

beforeEach(() => {
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.resetAllMocks());

const png = () => new File(["x"], "proof.png", { type: "image/png" });
const render = (order = makeOrder()) =>
  renderWithProviders(<ProofUploadForm token={TOKEN} order={order} />);

function pickFile(file: File) {
  fireEvent.change(screen.getByLabelText("Elegir comprobante de pago"), {
    target: { files: [file] },
  });
}

test("prefills the amount with the balance in cents, minus proofs in review", () => {
  render(makeOrder({ pendingAmount: 30 }));
  expect(
    (screen.getByLabelText(/Monto pagado/) as HTMLInputElement).value,
  ).toBe("30.00");
});

test("prefill subtracts pending proofs", () => {
  render(
    makeOrder({
      pendingAmount: 30,
      payments: [makePayment({ amount: "12.5" })],
    }),
  );
  expect(
    (screen.getByLabelText(/Monto pagado/) as HTMLInputElement).value,
  ).toBe("17.50");
});

test("offers only the store's configured methods", () => {
  render();
  const options = screen
    .getAllByRole("option")
    .map((option) => option.textContent);
  expect(options).toHaveLength(2); // placeholder + YAPE
});

test("renders no form when the store has no payment methods", () => {
  render(makeOrder({ paymentMethods: [] }));
  expect(
    screen.queryByRole("button", { name: "Enviar comprobante" }),
  ).toBeNull();
});

test("shows inline errors and does not call the API on an invalid form", async () => {
  render();
  fireEvent.click(screen.getByRole("button", { name: "Enviar comprobante" }));
  expect(await screen.findByText("Elige un método de pago.")).toBeTruthy();
  expect(screen.getByText("Adjunta tu comprobante de pago.")).toBeTruthy();
  expect(submitProof).not.toHaveBeenCalled();
});

test("rejects an amount over the balance", async () => {
  render(makeOrder({ pendingAmount: 30 }));
  fireEvent.change(screen.getByLabelText(/Monto pagado/), {
    target: { value: "30.01" },
  });
  fireEvent.change(screen.getByLabelText("Método de pago"), {
    target: { value: "YAPE" },
  });
  pickFile(png());
  fireEvent.click(screen.getByRole("button", { name: "Enviar comprobante" }));
  expect(
    await screen.findByText("El monto es mayor a lo que falta pagar."),
  ).toBeTruthy();
  expect(submitProof).not.toHaveBeenCalled();
});

test("accepts a PDF proof", async () => {
  submitProof.mockResolvedValue({ id: "p1" });
  render();
  fireEvent.change(screen.getByLabelText("Método de pago"), {
    target: { value: "YAPE" },
  });
  const pdf = new File(["%PDF-1.7"], "p.pdf", { type: "application/pdf" });
  pickFile(pdf);
  expect(screen.getByText("PDF seleccionado")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Enviar comprobante" }));
  await screen.findByRole("status");
  expect(submitProof).toHaveBeenCalledWith(
    TOKEN,
    expect.objectContaining({ file: pdf }),
    expect.any(String),
  );
});

test("rejects a file over 5 MB", async () => {
  render();
  fireEvent.change(screen.getByLabelText("Método de pago"), {
    target: { value: "YAPE" },
  });
  pickFile(
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Enviar comprobante" }));
  expect(await screen.findByText("El archivo pesa más de 5 MB.")).toBeTruthy();
  expect(submitProof).not.toHaveBeenCalled();
});

test("submits the values, disables the button while pending and shows success", async () => {
  let resolve!: (value: unknown) => void;
  submitProof.mockReturnValue(new Promise((r) => (resolve = r)));
  render();
  fireEvent.change(screen.getByLabelText("Método de pago"), {
    target: { value: "YAPE" },
  });
  fireEvent.change(screen.getByLabelText(/Número de operación/), {
    target: { value: "OP-9" },
  });
  pickFile(png());
  fireEvent.click(screen.getByRole("button", { name: "Enviar comprobante" }));

  const pending = await screen.findByRole("button", { name: "Enviando..." });
  expect((pending as HTMLButtonElement).disabled).toBe(true);
  expect(submitProof).toHaveBeenCalledTimes(1);
  const [token, values] = submitProof.mock.calls[0]!;
  expect(token).toBe(TOKEN);
  expect(values).toMatchObject({
    amount: "30.00",
    method: "YAPE",
    operationCode: "OP-9",
  });

  resolve({ id: "p1" });
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(screen.getByText(/Recibimos tu comprobante/)).toBeTruthy();
});

test.each([
  [404, "Este enlace ya no es válido. Pídele uno nuevo a la tienda."],
  [413, "El archivo es demasiado grande."],
  [429, "Hiciste muchos intentos. Espera un momento."],
  [400, "No pudimos enviar tu comprobante. Inténtalo de nuevo."],
])(
  "maps a %i response to a message and keeps the entered values",
  async (status, message) => {
    submitProof.mockRejectedValue(
      new ApiError("El monto excede el saldo pendiente", status),
    );
    render();
    fireEvent.change(screen.getByLabelText("Método de pago"), {
      target: { value: "YAPE" },
    });
    pickFile(png());
    fireEvent.click(screen.getByRole("button", { name: "Enviar comprobante" }));
    expect(await screen.findByText(message)).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Monto pagado/) as HTMLInputElement).value,
      ).toBe("30.00"),
    );
  },
);
