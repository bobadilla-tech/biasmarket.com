import { expect, test } from "vitest";
import {
  scrubBreadcrumb,
  scrubSentryEvent,
  scrubTokenText,
  scrubTokenUrl,
} from "./scrub-sentry";

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
  const crumb = scrubBreadcrumb({
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

test("scrubTokenText replaces only the token segment", () => {
  expect(scrubTokenText(`see /pedido/${TOKEN}/x and more`)).toBe(
    "see /pedido/:token/x and more",
  );
  expect(scrubTokenText("nothing here")).toBe("nothing here");
});
