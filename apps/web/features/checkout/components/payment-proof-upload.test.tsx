import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { PaymentProofUpload } from "./payment-proof-upload";

test("keeps the file control keyboard reachable and announces the selected file", () => {
  const onChange = vi.fn();
  renderWithProviders(
    <PaymentProofUpload value={null} onChange={onChange} id="proof-file" />,
  );

  const input = screen.getByLabelText("Adjunta tu comprobante");
  expect(input.classList.contains("sr-only")).toBe(true);
  expect(input.classList.contains("hidden")).toBe(false);
  input.focus();
  expect(document.activeElement).toBe(input);

  const file = new File(["proof"], "proof.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  expect(onChange).toHaveBeenCalledWith(file);
});
