import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("Apple Universal Links association", () => {
  afterEach(() => {
    delete process.env.IOS_TEAM_ID;
  });

  it("does not publish an unverifiable app id", async () => {
    delete process.env.IOS_TEAM_ID;
    expect((await GET()).status).toBe(503);
  });

  it("associates product and buyer order URLs with the mobile bundle", async () => {
    process.env.IOS_TEAM_ID = "ABCDE12345";
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.applinks.details[0].appIDs).toEqual([
      "ABCDE12345.com.biasmarket.mobile",
    ]);
    expect(body.applinks.details[0].components).toHaveLength(2);
  });
});
