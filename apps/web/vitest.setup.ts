import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no PointerEvent constructor — Base UI's Switch (and other
// primitives using pointer capture) read `ownerWindow(...).PointerEvent`
// directly on click, which throws without this. A plain MouseEvent subclass
// is enough for the properties these components actually read in tests.
if (typeof window !== "undefined" && !globalThis.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId = 1;
    pointerType = "mouse";
    isPrimary = true;
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params);
    }
  }
  // @ts-expect-error jsdom's lib.dom types don't include PointerEvent
  globalThis.PointerEvent = PointerEventPolyfill;
}

// jsdom doesn't implement URL.createObjectURL/revokeObjectURL, which the
// checkout and register-payment proof uploads use to render live image
// previews. A no-op stub is enough — tests assert the preview <img> mounts
// (and that a picked file's object URL gets created), never the blob bytes.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = vi.fn(() => `blob:preview-${crypto.randomUUID()}`);
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  cleanup();
});
