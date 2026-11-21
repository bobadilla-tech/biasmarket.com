import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PaymentProofThumbnail } from "./payment-proof-thumbnail";

test("renders a PDF proof as a download link", () => {
  render(
    <PaymentProofThumbnail
      url="https://api.example/payment/1/image"
      isPdf
      label="Download PDF proof"
      className="proof"
      imageClassName="thumb"
      onPreview={() => {}}
    />,
  );

  expect(
    screen
      .getByRole("link", { name: "Download PDF proof" })
      .getAttribute("href"),
  ).toBe("https://api.example/payment/1/image");
  expect(screen.queryByRole("img")).toBeNull();
});

test("keeps image proofs in the preview flow", () => {
  const onPreview = vi.fn();
  render(
    <PaymentProofThumbnail
      url="https://api.example/payment/1/image"
      isPdf={false}
      label="View payment proof"
      className="proof"
      imageClassName="thumb"
      onPreview={onPreview}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "View payment proof" }));
  expect(onPreview).toHaveBeenCalledOnce();
  expect(document.querySelector("img")?.getAttribute("src")).toBe(
    "https://api.example/payment/1/image",
  );
});
