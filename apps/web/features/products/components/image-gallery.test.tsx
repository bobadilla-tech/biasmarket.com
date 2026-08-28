import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageGallery } from "./image-gallery";

// PR A pins the gallery's *current* behavior: safeCurrent clamp, reset-on-
// image-change, arrow wrap, and the hardcoded `#2d1649` active-thumb border.
// PR D edits this file to swap those for the a11y + theme-var assertions.

const IMAGES = [
  "https://cdn.biasmarket.com/a.jpg",
  "https://cdn.biasmarket.com/b.jpg",
  "https://cdn.biasmarket.com/c.jpg",
];

// The nav arrows are the first two <button>s (rendered only when there is
// more than one image); every button after them is a thumbnail, in order.
function thumbs() {
  return screen.getAllByRole("button").slice(2);
}

function activeThumbIndex() {
  return thumbs().findIndex((b) => b.className.includes("border-[#2d1649]"));
}

test("clicking a thumbnail makes it the active image", async () => {
  const user = userEvent.setup();
  render(<ImageGallery images={IMAGES} alt="Tee" />);

  expect(activeThumbIndex()).toBe(0);

  await user.click(thumbs()[2]);
  expect(activeThumbIndex()).toBe(2);

  // Main image tracks the active thumb (thumbnails carry an indexed alt,
  // the main image carries the bare alt).
  expect(
    (screen.getByAltText("Tee") as HTMLImageElement).getAttribute("src"),
  ).toContain(encodeURIComponent(IMAGES[2]));
});

test("the previous-arrow wraps from the first image to the last", async () => {
  const user = userEvent.setup();
  render(<ImageGallery images={IMAGES} alt="Tee" />);

  expect(activeThumbIndex()).toBe(0);
  await user.click(screen.getAllByRole("button")[0]); // prev
  expect(activeThumbIndex()).toBe(IMAGES.length - 1);
});

test("the next-arrow wraps from the last image back to the first", async () => {
  const user = userEvent.setup();
  render(<ImageGallery images={IMAGES} alt="Tee" />);

  await user.click(thumbs()[IMAGES.length - 1]);
  expect(activeThumbIndex()).toBe(IMAGES.length - 1);

  await user.click(screen.getAllByRole("button")[1]); // next
  expect(activeThumbIndex()).toBe(0);
});

test("shrinking the image list clamps the main image instead of blanking it", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<ImageGallery images={IMAGES} alt="Tee" />);

  await user.click(thumbs()[2]); // current -> 2
  expect(activeThumbIndex()).toBe(2);

  rerender(<ImageGallery images={IMAGES.slice(0, 2)} alt="Tee" />);

  // Main image still renders (no empty-state placeholder, no crash). The
  // reset effect brings current back to 0 once the new set commits.
  expect(screen.getByAltText("Tee")).toBeDefined();
  expect(activeThumbIndex()).toBe(0);
});

test("changing the image set resets the active image to the first", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<ImageGallery images={IMAGES} alt="Tee" />);

  await user.click(thumbs()[2]);
  expect(activeThumbIndex()).toBe(2);

  rerender(
    <ImageGallery
      images={[
        "https://cdn.biasmarket.com/x.jpg",
        "https://cdn.biasmarket.com/y.jpg",
      ]}
      alt="Tee"
    />,
  );

  expect(activeThumbIndex()).toBe(0);
});

test("a single image renders no nav arrows and no thumbnail strip", () => {
  render(<ImageGallery images={[IMAGES[0]]} alt="Tee" />);
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});

test("an empty image list renders a placeholder, no image", () => {
  render(<ImageGallery images={[]} alt="Tee" />);
  expect(screen.queryByAltText("Tee")).toBeNull();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});
