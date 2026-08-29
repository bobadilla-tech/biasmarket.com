/**
 * jsdom implements none of `matchMedia`, `ResizeObserver`, or
 * `IntersectionObserver`. Base UI positioners, recharts' `ResponsiveContainer`,
 * `useIsMobile()`, and every `prefers-reduced-motion` check reach for them at
 * mount and throw without a stub.
 *
 * `installBrowserEnvStubs()` (called once from `vitest.setup.ts`) installs all
 * three. `matchMedia` is backed by a mutable viewport width + reduced-motion
 * flag so responsive component tests can drive breakpoints deterministically
 * via `setViewport()` / `setReducedMotion()`. `resetViewport()` runs in the
 * global `afterEach`.
 */

const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 768;

let currentWidth = DEFAULT_WIDTH;
let currentHeight = DEFAULT_HEIGHT;
let reducedMotion = false;

type ChangeListener = (ev: MediaQueryListEvent) => void;

class MediaQueryListStub {
  readonly media: string;
  matches: boolean;
  onchange: ChangeListener | null = null;
  private readonly listeners = new Set<ChangeListener>();
  private readonly evaluate: () => boolean;

  constructor(media: string, evaluate: () => boolean) {
    this.media = media;
    this.evaluate = evaluate;
    this.matches = evaluate();
  }

  addEventListener(type: string, cb: ChangeListener): void {
    if (type === "change") this.listeners.add(cb);
  }

  removeEventListener(type: string, cb: ChangeListener): void {
    if (type === "change") this.listeners.delete(cb);
  }

  // Deprecated MediaQueryList API — still called by some libraries.
  addListener(cb: ChangeListener): void {
    this.listeners.add(cb);
  }

  removeListener(cb: ChangeListener): void {
    this.listeners.delete(cb);
  }

  dispatchEvent(_ev: Event): boolean {
    return true;
  }

  /** Internal: re-run the predicate; fire `change` if the result flipped. */
  reevaluate(): void {
    const next = this.evaluate();
    if (next === this.matches) return;
    this.matches = next;
    const ev = { matches: next, media: this.media } as MediaQueryListEvent;
    this.onchange?.(ev);
    for (const cb of [...this.listeners]) cb(ev);
  }
}

const registry = new Set<MediaQueryListStub>();

/** Turn one media-feature clause into a predicate over the current viewport. */
function clausePredicate(clause: string): () => boolean {
  const text = clause
    .trim()
    .replace(/^\(|\)$/g, "")
    .trim();

  let m = /^max-width:\s*(\d+(?:\.\d+)?)px$/.exec(text);
  if (m) {
    const n = Number(m[1]);
    return () => currentWidth <= n;
  }
  m = /^min-width:\s*(\d+(?:\.\d+)?)px$/.exec(text);
  if (m) {
    const n = Number(m[1]);
    return () => currentWidth >= n;
  }
  m = /^max-height:\s*(\d+(?:\.\d+)?)px$/.exec(text);
  if (m) {
    const n = Number(m[1]);
    return () => currentHeight <= n;
  }
  m = /^min-height:\s*(\d+(?:\.\d+)?)px$/.exec(text);
  if (m) {
    const n = Number(m[1]);
    return () => currentHeight >= n;
  }
  if (/^prefers-reduced-motion:\s*reduce$/.test(text)) {
    return () => reducedMotion;
  }
  if (/^prefers-reduced-motion(:\s*no-preference)?$/.test(text)) {
    return () => !reducedMotion;
  }
  // Unknown feature (hover, pointer, orientation, …): default to no match so a
  // test never silently depends on an unmodelled query.
  return () => false;
}

function compileQuery(query: string): () => boolean {
  const parts = query
    .split(/\s+and\s+/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^(all|screen|only screen)$/i.test(p));
  if (parts.length === 0) return () => true;
  const predicates = parts.map(clausePredicate);
  return () => predicates.every((p) => p());
}

function matchMediaStub(query: string): MediaQueryList {
  const mql = new MediaQueryListStub(query, compileQuery(query));
  registry.add(mql);
  return mql as unknown as MediaQueryList;
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(
    _cb: IntersectionObserverCallback,
    _opts?: IntersectionObserverInit,
  ) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/** Set the emulated viewport width (px); re-evaluates every live media query. */
export function setViewport(width: number, height = currentHeight): void {
  if (typeof window === "undefined") return;
  currentWidth = width;
  currentHeight = height;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  for (const mql of [...registry]) mql.reevaluate();
  window.dispatchEvent(new Event("resize"));
}

/** Toggle the emulated `prefers-reduced-motion` state. */
export function setReducedMotion(value: boolean): void {
  reducedMotion = value;
  for (const mql of [...registry]) mql.reevaluate();
}

/** Restore defaults and drop stale MediaQueryList instances (global afterEach). */
export function resetViewport(): void {
  registry.clear();
  if (typeof window === "undefined") return;
  currentWidth = DEFAULT_WIDTH;
  currentHeight = DEFAULT_HEIGHT;
  reducedMotion = false;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: DEFAULT_WIDTH,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: DEFAULT_HEIGHT,
  });
}

export function installBrowserEnvStubs(): void {
  if (typeof window === "undefined") return;

  window.matchMedia = matchMediaStub as typeof window.matchMedia;

  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;
  }
  if (!("IntersectionObserver" in globalThis)) {
    globalThis.IntersectionObserver =
      IntersectionObserverStub as unknown as typeof IntersectionObserver;
  }
}
