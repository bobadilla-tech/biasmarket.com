import { expect, test, vi } from "vitest";
import {
  scrubOrDrop,
  scrubSentryEvent,
  scrubTokenText,
  scrubTokenUrl,
} from "./index";

const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc";

test("replaces the token in page and API paths and drops the query and hash", () => {
  expect(
    scrubTokenUrl(`https://biasmarket.com/es/store/k/pedido/${TOKEN}?x=1#h`),
  ).toBe("https://biasmarket.com/es/store/k/pedido/:token");
  expect(
    scrubTokenUrl(
      `https://api.biasmarket.com/api/public/orders/${TOKEN}/events`,
    ),
  ).toBe("https://api.biasmarket.com/api/public/orders/:token/events");
});

test("leaves unrelated URLs and text untouched", () => {
  const url = "https://biasmarket.com/es/store/k?utm=1";
  expect(scrubTokenUrl(url)).toBe(url);
  expect(scrubTokenUrl("plain text")).toBe("plain text");
});

test("scrubs request url, transaction, tags, breadcrumbs and spans", () => {
  const event = {
    request: {
      url: `https://biasmarket.com/es/store/k/pedido/${TOKEN}?a=b`,
      query_string: "a=b",
    },
    transaction: `/es/store/k/pedido/${TOKEN}`,
    tags: { url: `/public/orders/${TOKEN}` },
    breadcrumbs: [
      {
        category: "fetch",
        data: { url: `https://api.biasmarket.com/api/public/orders/${TOKEN}` },
      },
      { category: "navigation", data: { to: `/es/store/k/pedido/${TOKEN}` } },
    ],
  };

  const scrubbed = scrubSentryEvent(event);

  expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
  expect(scrubbed.request?.query_string).toBeUndefined();
});

test("a single breadcrumb is scrubbed in place", () => {
  const crumb = scrubSentryEvent({
    message: `GET /public/orders/${TOKEN}`,
    data: { url: `/public/orders/${TOKEN}`, status_code: 200 },
  });
  expect(JSON.stringify(crumb)).not.toContain(TOKEN);
  expect(crumb.data?.status_code).toBe(200);
});

test("scrubs the token from every field the SDK can fill, keeping surrounding text", () => {
  const page = `/es/store/k/pedido/${TOKEN}`;
  const event = {
    request: {
      url: `https://biasmarket.com${page}`,
      headers: { Referer: `https://biasmarket.com${page}?a=1` },
    },
    exception: { values: [{ value: `Failed to fetch ${page}, retry?` }] },
    spans: [
      {
        data: {
          "http.url": `https://api.biasmarket.com/api/public/orders/${TOKEN}`,
        },
      },
    ],
    contexts: { trace: { data: { url: `https://biasmarket.com${page}` } } },
    extra: { request: { pathname: page } },
  };

  const out = JSON.stringify(scrubSentryEvent(event));

  expect(out).not.toContain(TOKEN);
  expect(out).toContain("Failed to fetch /es/store/k/pedido/:token, retry?");
});

test("preserves diagnostic text after assisted-order path tokens", () => {
  const event = {
    exception: {
      values: [
        {
          value: `Error at /store/k/pedido/${TOKEN} while parsing: unexpected #1 in body`,
        },
        {
          value: `GET /pedido/${TOKEN} failed (status=500) retry?yes`,
        },
        {
          value: `message: see /pedido/${TOKEN}, then /pedido/${TOKEN}/pago`,
        },
      ],
    },
  };

  const scrubbed = scrubSentryEvent(event);

  expect(scrubbed.exception.values.map(({ value }) => value)).toEqual([
    "Error at /store/k/pedido/:token while parsing: unexpected #1 in body",
    "GET /pedido/:token failed (status=500) retry?yes",
    "message: see /pedido/:token, then /pedido/:token/pago",
  ]);
  expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
});

test("truncates over-depth event data instead of preserving an unsanitized value", () => {
  const deep: Record<string, unknown> = {};
  let current = deep;
  for (let i = 0; i < 12; i += 1) {
    const child: Record<string, unknown> = {};
    current.n = child;
    current = child;
  }
  current.token = TOKEN;

  const scrubbed = scrubSentryEvent({ extra: { deep } });

  expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
  expect(JSON.stringify(scrubbed)).toContain("[Truncated]");
});

test("scrubTokenText replaces only the token segment", () => {
  expect(scrubTokenText(`see /pedido/${TOKEN}/x and more`)).toBe(
    "see /pedido/:token/x and more",
  );
  expect(scrubTokenText("nothing here")).toBe("nothing here");
});

test("does not throw on getter-only properties or walk SDK internals", () => {
  const scope = {};
  Object.defineProperty(scope, "$", { get: () => "live", enumerable: true });
  const event = {
    transaction: "GET /api/health",
    extra: { holder: scope },
    sdkProcessingMetadata: { capturedSpanScope: scope },
  };

  expect(() => scrubSentryEvent(event)).not.toThrow();
  expect(event.extra.holder).toBe(scope);
});

test("scrubOrDrop drops the event when a changed value cannot be written back", () => {
  const warn = vi.fn();
  const holder = {};
  Object.defineProperty(holder, "url", {
    get: () => `/pedido/${TOKEN}`,
    enumerable: true,
  });

  expect(scrubOrDrop({ extra: { holder } }, warn)).toBeNull();
  expect(warn).toHaveBeenCalledOnce();
});

test("drops the query string and trace query data beside a token URL", () => {
  const event = {
    request: {
      url: `https://api.biasmarket.com/api/public/orders/${TOKEN}?token=x`,
      query_string: "token=x",
    },
    contexts: {
      trace: {
        data: {
          "http.target": `/api/public/orders/${TOKEN}?token=x`,
          "http.query": "token=x",
          "url.query": "token=x",
        },
      },
    },
    spans: [
      {
        description: `GET /api/public/orders/${TOKEN}?token=x`,
        data: { "http.url": `/api/public/orders/${TOKEN}?token=x` },
      },
    ],
  };

  const out = scrubSentryEvent(event);

  expect(JSON.stringify(out)).not.toContain(TOKEN);
  expect(JSON.stringify(out)).not.toContain("token=x");
  expect(out.request.query_string).toBeUndefined();
});
