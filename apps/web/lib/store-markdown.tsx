import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { fromMarkdown } from "mdast-util-from-markdown";
import { CDN_URL } from "@/lib/site-config";

// ---------------------------------------------------------------------------
// This module is the XSS boundary for seller-authored store content
// (`Store.aboutMarkdown`). It is multi-tenant, untrusted input. The allowlist
// below — not any single library — is the contract; see
// docs/plans/2026-09-07-store-rich-content-and-thin-content-indexing-plan.md
// Part 6.1. Any change here needs a security review (`/security-review`).
//
// Guarantees:
//   * only the elements in ALLOWED_ELEMENTS ever reach the DOM
//   * NO raw HTML passthrough (remark-rehype runs without allowDangerousHtml,
//     `skipHtml` drops HTML nodes, rehype-sanitize is a second gate)
//   * NO <h1> — the page owns the single <h1>; `#` is demoted to <h2>
//   * <a> is always rel="nofollow ugc noopener" target="_blank", http(s)/mailto
//     only — sellers cannot pass platform ranking authority or a javascript: URL
//   * <img> src must resolve to the platform CDN host; alt must be non-empty;
//     loading="lazy" decoding="async" are forced
// ---------------------------------------------------------------------------

/** Post-demotion tag allowlist. Kept in sync with SANITIZE_SCHEMA.tagNames. */
const ALLOWED_ELEMENTS = [
  "p",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "blockquote",
  "a",
  "img",
  "code",
  "pre",
  "hr",
  "br",
] as const;

/**
 * The single CDN host store images are allowed to load from. `NEXT_PUBLIC_CDN_URL`
 * is the prod override; the literal is the deployed default. localhost (any port)
 * is additionally permitted outside production so the dev MinIO endpoint works.
 */
const CDN_HOST = (() => {
  try {
    return new URL(CDN_URL).host;
  } catch {
    return "cdn.biasmarket.com";
  }
})();

/** `true` only for an absolute http(s)/mailto URL — no relative, no other scheme. */
export function isSafeStoreLinkHref(
  href: string | null | undefined,
): href is string {
  if (!href) return false;
  // Must carry an explicit scheme we recognise (rejects relative + protocol-relative).
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return (
    url.protocol === "http:" ||
    url.protocol === "https:" ||
    url.protocol === "mailto:"
  );
}

/** `true` only for an image URL on the platform CDN host (or localhost in dev). */
export function isAllowedStoreImageSrc(
  src: string | null | undefined,
): src is string {
  if (!src) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol === "https:" && url.host === CDN_HOST) return true;
  // Also accept the hard-coded production host even if CDN_URL is overridden,
  // so committed seller content keeps resolving across env changes.
  if (url.protocol === "https:" && url.host === "cdn.biasmarket.com")
    return true;
  if (
    process.env.NODE_ENV !== "production" &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  ) {
    return true;
  }
  return false;
}

/** Drop any scheme react-markdown would otherwise pass straight through. */
function storeUrlTransform(url: string): string {
  return /^(https?:|mailto:)/i.test(url) ? url : "";
}

// rehype-sanitize schema — an explicit, tight allowlist. `attributes` and
// `protocols` are REPLACED (not merged) so nothing from the default schema
// (className, id, data-*, cite, ...) leaks through.
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...ALLOWED_ELEMENTS],
  attributes: {
    a: ["href"],
    img: ["src", "alt"],
  },
  protocols: {
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
  // Disallowed elements: remove the node AND its subtree, don't inline the text.
  strip: ["script", "style", "iframe", "title", "textarea", "noscript"],
  clobber: [],
};

/**
 * rehype plugin: clamp heading levels into the allowed h2–h4 band BEFORE
 * sanitize runs. `#` -> h2 (sanitize would otherwise strip h1 and orphan its
 * text); h5/h6 -> h4.
 */
function rehypeClampHeadings() {
  const remap: Record<string, string> = { h1: "h2", h5: "h4", h6: "h4" };
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const el = node as {
      type?: string;
      tagName?: string;
      children?: unknown[];
    };
    if (el.type === "element" && el.tagName && remap[el.tagName]) {
      el.tagName = remap[el.tagName];
    }
    if (Array.isArray(el.children)) el.children.forEach(walk);
  };
  return (tree: unknown) => {
    walk(tree);
  };
}

const REHYPE_PLUGINS = [
  rehypeClampHeadings,
  [rehypeSanitize, SANITIZE_SCHEMA],
] as Options["rehypePlugins"];

const components: Components = {
  a({ href, children }: ComponentPropsWithoutRef<"a">) {
    if (!isSafeStoreLinkHref(href)) return <>{children}</>;
    return (
      <a href={href} rel="nofollow ugc noopener" target="_blank">
        {children}
      </a>
    );
  },
  img({ src, alt }: ComponentPropsWithoutRef<"img">) {
    if (typeof alt !== "string" || alt.trim() === "") return null;
    if (typeof src !== "string" || !isAllowedStoreImageSrc(src)) return null;
    return <img src={src} alt={alt} loading="lazy" decoding="async" />;
  },
};

/**
 * Render seller markdown to a sanitised React tree. Returns `null` for
 * empty/whitespace input. Safe to call from a Server Component.
 */
export function renderStoreMarkdown(md: string | null | undefined): ReactNode {
  const text = (md ?? "").trim();
  if (!text) return null;
  return (
    <ReactMarkdown
      skipHtml
      allowedElements={[...ALLOWED_ELEMENTS]}
      unwrapDisallowed
      urlTransform={storeUrlTransform}
      rehypePlugins={REHYPE_PLUGINS}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
}

/**
 * Flatten an mdast node to text, separating block-level children with a space
 * (mdast-util-to-string concatenates with nothing, gluing "Heading" onto the
 * next paragraph). Whitespace is collapsed by the caller.
 */
function mdastToPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; value?: unknown; children?: unknown[] };
  if (typeof n.value === "string") return n.value;
  if (n.type === "break") return " ";
  if (Array.isArray(n.children)) {
    return n.children.map(mdastToPlainText).join(" ");
  }
  return "";
}

/**
 * Flatten seller markdown to a single line of plain text (for <meta
 * description> and JSON-LD). `max`, when given, hard-caps the result length
 * including a trailing ellipsis.
 */
export function storeMarkdownToPlainText(
  md: string | null | undefined,
  max?: number,
): string {
  const text = (md ?? "").trim();
  if (!text) return "";
  let out: string;
  try {
    out = mdastToPlainText(fromMarkdown(text));
  } catch {
    out = text;
  }
  out = out.replace(/\s+/g, " ").trim();
  if (max && max > 0 && out.length > max) {
    out = `${out
      .slice(0, Math.max(0, max - 1))
      .replace(/\s+\S*$/, "")
      .trim()}…`;
  }
  return out;
}

/**
 * The URL of the first inline image in `md` that resolves to the platform CDN
 * host, or `null`. Used for the store page's og:image.
 */
export function firstStoreMarkdownImage(
  md: string | null | undefined,
): string | null {
  const text = (md ?? "").trim();
  if (!text) return null;
  let found: string | null = null;
  const walk = (node: unknown): void => {
    if (found || !node || typeof node !== "object") return;
    const n = node as { type?: string; url?: unknown; children?: unknown[] };
    if (
      n.type === "image" &&
      typeof n.url === "string" &&
      isAllowedStoreImageSrc(n.url)
    ) {
      found = n.url;
      return;
    }
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  try {
    walk(fromMarkdown(text));
  } catch {
    return null;
  }
  return found;
}
