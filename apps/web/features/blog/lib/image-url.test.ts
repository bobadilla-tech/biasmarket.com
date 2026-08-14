import { afterEach, expect, it, vi } from "vitest";

const SOURCE = {
  _type: "image",
  asset: { _ref: "image-abc123-1200x800-jpg" },
  alt: "Alt text",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadConfiguredUrlForImage() {
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "n5geyqv5");
  vi.stubEnv("NEXT_PUBLIC_SANITY_DATASET", "production");
  const { urlForImage } = await import("./sanity");
  return urlForImage;
}

it("builds a Sanity CDN URL for a valid source", async () => {
  const urlForImage = await loadConfiguredUrlForImage();
  const url = urlForImage(SOURCE, 1200);
  expect(url).toContain("cdn.sanity.io/images/n5geyqv5/production");
  expect(url).toContain("w=1200");
  expect(url).toContain("auto=format");
});

it("omits the width param when no width is requested", async () => {
  const urlForImage = await loadConfiguredUrlForImage();
  const url = urlForImage(SOURCE);
  expect(url).not.toContain("w=");
});

it("returns null when no source is provided", async () => {
  const urlForImage = await loadConfiguredUrlForImage();
  expect(urlForImage(null, 1200)).toBeNull();
  expect(urlForImage(undefined, 1200)).toBeNull();
});

it("returns null when the Sanity client is not configured", async () => {
  const { urlForImage } = await import("./sanity");
  expect(urlForImage(SOURCE, 1200)).toBeNull();
});
