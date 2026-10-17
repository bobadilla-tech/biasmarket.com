import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildLoggerParams,
  completionProps,
  ignoreRequest,
  levelFor,
  loggedPath,
  requestId,
  requestProps,
} from "./logger.config.js";

const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc";

function req(
  extra: Partial<IncomingMessage> & Record<string, unknown> = {},
): IncomingMessage {
  return { headers: {}, ...extra } as unknown as IncomingMessage;
}

function res() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as ServerResponse & { headers: Record<string, string> };
}

describe("loggedPath", () => {
  it("drops the query string", () => {
    expect(loggedPath("/api/stores?email=a@b.com&q=secret")).toBe(
      "/api/stores",
    );
  });

  it("replaces both private order tokens", () => {
    expect(loggedPath(`/api/public/orders/${TOKEN}/payments?x=1`)).toBe(
      "/api/public/orders/:token/payments",
    );
    expect(loggedPath(`/es/store/k/pedido/${TOKEN}`)).toBe(
      "/es/store/k/pedido/:token",
    );
  });

  it("tolerates a missing url", () => {
    expect(loggedPath(undefined)).toBe("");
  });
});

describe("requestId", () => {
  it("reuses a well-formed inbound id and echoes it on the response", () => {
    const response = res();
    const id = requestId(
      req({ headers: { "x-request-id": "abc-12345678" } }),
      response,
    );
    expect(id).toBe("abc-12345678");
    expect(response.headers["x-request-id"]).toBe("abc-12345678");
  });

  it("mints an id when the inbound one is missing or unsafe", () => {
    for (const bad of [
      undefined,
      "short",
      "has spaces and \n newline",
      "x".repeat(200),
    ]) {
      const response = res();
      const id = requestId(req({ headers: { "x-request-id": bad } }), response);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.headers["x-request-id"]).toBe(id);
    }
  });
});

describe("ignoreRequest", () => {
  it("skips health probes only", () => {
    expect(ignoreRequest(req({ originalUrl: "/api/health" }))).toBe(true);
    expect(ignoreRequest(req({ originalUrl: "/health" }))).toBe(true);
    expect(ignoreRequest(req({ originalUrl: "/api/stores/1/orders" }))).toBe(
      false,
    );
  });
});

describe("levelFor", () => {
  it("maps status codes to log levels", () => {
    expect(levelFor(200)).toBe("info");
    expect(levelFor(302)).toBe("info");
    expect(levelFor(404)).toBe("warn");
    expect(levelFor(500)).toBe("error");
    expect(levelFor(200, new Error("boom"))).toBe("error");
  });
});

describe("requestProps", () => {
  it("emits flat, scrubbed fields known at the start of a request", () => {
    const props = requestProps(
      req({
        id: "r1",
        method: "POST",
        originalUrl: `/api/public/orders/${TOKEN}/payments?token=x`,
        headers: { cookie: "session=secret", authorization: "Bearer secret" },
      }),
    );

    expect(props).toEqual({
      requestId: "r1",
      method: "POST",
      path: "/api/public/orders/:token/payments",
    });
    expect(JSON.stringify(props)).not.toMatch(/secret|cookie|authorization/);
  });

  it("never includes anything only known after the response (no duplicate keys)", () => {
    const props = requestProps(req({ params: { storeId: "s1" } }));
    expect(props).not.toHaveProperty("statusCode");
    expect(props).not.toHaveProperty("storeId");
  });
});

describe("completionProps", () => {
  it("adds the status and the store the route resolved", () => {
    const response = { statusCode: 404 } as ServerResponse;
    expect(
      completionProps(req({ params: { storeId: "s1" } }), response),
    ).toEqual({
      statusCode: 404,
      storeId: "s1",
    });
    expect(
      completionProps(req({ params: { slug: "korealexa" } }), response),
    ).toEqual({
      statusCode: 404,
      storeSlug: "korealexa",
    });
  });

  it("adds only the status for a route without store params", () => {
    expect(
      completionProps(req(), { statusCode: 200 } as ServerResponse),
    ).toEqual({
      statusCode: 200,
    });
  });
});

describe("buildLoggerParams", () => {
  it("drops pino-http's default req/res dump, which carries every header", () => {
    const options = buildLoggerParams().pinoHttp as {
      serializers: Record<string, (value: unknown) => unknown>;
    };
    const dump = { headers: { cookie: "session=secret" } };
    expect(options.serializers.req!(dump)).toBeUndefined();
    expect(options.serializers.res!(dump)).toBeUndefined();
  });

  it("honours LOG_LEVEL and defaults to info", () => {
    const previous = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    expect((buildLoggerParams().pinoHttp as { level: string }).level).toBe(
      "info",
    );
    process.env.LOG_LEVEL = "";
    expect((buildLoggerParams().pinoHttp as { level: string }).level).toBe(
      "info",
    );
    process.env.LOG_LEVEL = "warn";
    expect((buildLoggerParams().pinoHttp as { level: string }).level).toBe(
      "warn",
    );
    if (previous === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previous;
  });
});
