import { afterEach } from "vitest";
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

afterEach(() => {
  cleanup();
});
