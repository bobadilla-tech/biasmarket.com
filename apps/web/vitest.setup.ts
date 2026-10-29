import { createElement } from "react";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { installBrowserEnvStubs, resetViewport } from "./test-utils/viewport";

// jsdom ships no matchMedia / ResizeObserver / IntersectionObserver — Base UI
// positioners, recharts, useIsMobile(), and prefers-reduced-motion checks all
// need them. `setViewport()` / `setReducedMotion()` from ./test-utils/viewport
// drive the matchMedia stub in responsive tests.
installBrowserEnvStubs();

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

// next/image validates `src` against next.config.ts `images.remotePatterns`
// when that config reaches the runtime, which makes tests that render a CDN URL
// depend on how vitest was launched (issue #341). Tests only read the `src`
// attribute, never the optimizer's `/_next/image` URL or `srcset`, so render a
// plain <img> and drop the props that are not valid DOM attributes. Next's real
// config is untouched; `next.config.test.ts` pins the allowed hosts.
vi.mock("next/image", () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    loader: _loader,
    quality: _quality,
    ...props
  }: Record<string, unknown>) => createElement("img", props),
}));

afterEach(() => {
  cleanup();
  resetViewport();
});
