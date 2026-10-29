import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "es", slug: "k-store" }),
}));
vi.mock("@/lib/api-client", () => ({ apiClient: { orders: {} } }));

const { SellerPaymentForm } = await import("./seller-payment-form");
const { DuplicateOperationCodeError } = await import("../api/orders.api");

const NOW = new Date("2026-10-28T17:00:00.000Z"); // 12:00 in Lima

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
  vi.setSystemTime(NOW);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
});

const png = () => new File(["x"], "capture.png", { type: "image/png" });

function renderForm(
  props: Partial<React.ComponentProps<typeof SellerPaymentForm>> = {},
) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(
    <SellerPaymentForm
      maxCents={6000}
      hasPendingProof={false}
      enabledMethods={["YAPE", "CASH"]}
      submitting={false}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return onSubmit;
}

const fill = (method: string, file: File | null = png()) => {
  fireEvent.change(screen.getByLabelText("Selecciona un método de pago"), {
    target: { value: method },
  });
  if (file) {
    fireEvent.change(screen.getByLabelText("Subir comprobante de pago"), {
      target: { files: [file] },
    });
  }
};
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "Guardar pago" }));

test("prefills the amount with the recordable balance in cents and today in Lima", () => {
  renderForm({ maxCents: 5999 });
  expect(
    (screen.getByLabelText(/Monto pagado/) as HTMLInputElement).value,
  ).toBe("59.99");
  const date = screen.getByLabelText("Fecha del pago") as HTMLInputElement;
  expect(date.value).toBe("2026-10-28");
  expect(date.max).toBe("2026-10-28");
});

test("shows the pending-proof hint only when a buyer proof is waiting", () => {
  renderForm({ hasPendingProof: true });
  expect(screen.getByText(/Valídalo en vez de crear otro pago/)).toBeTruthy();
});

test("has no hint without a pending proof", () => {
  renderForm();
  expect(screen.queryByText(/Valídalo en vez de crear otro pago/)).toBeNull();
});

test("disables saving when pending proofs already cover the balance", () => {
  renderForm({ maxCents: 0, hasPendingProof: true });
  expect(
    (screen.getByRole("button", { name: "Guardar pago" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("requires a capture unless the method is CASH", async () => {
  const onSubmit = renderForm();
  fill("YAPE", null);
  save();
  expect(await screen.findByText(/Adjunta la captura del pago/)).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();

  fill("CASH", null);
  save();
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0]![0]).toMatchObject({
    method: "CASH",
    file: null,
    paidAt: "2026-10-28",
  });
});

test("rejects an amount above what can be recorded", async () => {
  const onSubmit = renderForm({ maxCents: 6000 });
  fireEvent.change(screen.getByLabelText(/Monto pagado/), {
    target: { value: "60.01" },
  });
  fill("YAPE");
  save();
  expect(
    await screen.findByText(/mayor a lo que se puede registrar/),
  ).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("submits the code, the date and the capture", async () => {
  const onSubmit = renderForm();
  fireEvent.change(screen.getByLabelText("Número de operación (opcional)"), {
    target: { value: "OP-77" },
  });
  fireEvent.change(screen.getByLabelText("Fecha del pago"), {
    target: { value: "2026-10-01" },
  });
  fill("YAPE");
  save();
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  const [values, options] = onSubmit.mock.calls[0]!;
  expect(values).toMatchObject({
    amount: "60.00",
    method: "YAPE",
    operationCode: "OP-77",
    paidAt: "2026-10-01",
  });
  expect(values.file).toBeInstanceOf(File);
  expect(options).toBeUndefined();
});

test("a duplicate opens the dialog, links the other order and keeps the capture for the confirmed retry", async () => {
  const onSubmit = renderForm();
  onSubmit.mockRejectedValueOnce(
    new DuplicateOperationCodeError("other-order"),
  );
  const capture = png();
  fireEvent.change(screen.getByLabelText("Número de operación (opcional)"), {
    target: { value: "OP-1" },
  });
  fill("YAPE", capture);
  save();

  expect(
    await screen.findByText("Este número de operación ya existe"),
  ).toBeTruthy();
  const link = screen.getByRole("link", { name: "Ver el otro pedido" });
  expect(link.getAttribute("href")).toBe(
    "/es/dashboard/k-store/orders?order=other-order",
  );

  fireEvent.click(screen.getByRole("button", { name: "Registrar igual" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  const [values, options] = onSubmit.mock.calls[1]!;
  expect(options).toEqual({ confirmDuplicate: true });
  // The same File object: the seller does not have to pick it again.
  expect(values.file).toBe(capture);
  expect(values.operationCode).toBe("OP-1");
  await waitFor(() =>
    expect(screen.queryByText("Este número de operación ya existe")).toBeNull(),
  );
});

test("cancelling the duplicate dialog records nothing and keeps the form", async () => {
  const onSubmit = renderForm();
  onSubmit.mockRejectedValueOnce(
    new DuplicateOperationCodeError("other-order"),
  );
  fill("YAPE");
  save();
  await screen.findByText("Este número de operación ya existe");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() =>
    expect(screen.queryByText("Este número de operación ya existe")).toBeNull(),
  );
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByLabelText(/Monto pagado/) as HTMLInputElement).value,
  ).toBe("60.00");
});

test("another error is shown inline and the values are kept", async () => {
  const onSubmit = renderForm();
  onSubmit.mockRejectedValueOnce(
    new Error("El abono excede el saldo pendiente"),
  );
  fill("YAPE");
  save();
  expect(
    await screen.findByText("El abono excede el saldo pendiente"),
  ).toBeTruthy();
  expect(
    (screen.getByLabelText(/Monto pagado/) as HTMLInputElement).value,
  ).toBe("60.00");
});
