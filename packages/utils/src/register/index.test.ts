import { describe, expect, it } from "vitest";
import {
  resolveRegister,
  resolveStoreCountry,
  VOSEO_COUNTRIES,
} from "./index.js";

describe("resolveRegister", () => {
  it.each([...VOSEO_COUNTRIES])("uses voseo for auto country %s", (country) => {
    expect(resolveRegister({ locale: "es", country })).toBe("voseo");
  });

  it.each(["PE", "CL", "CO", "BO", "VE", "EC", "MX", "PA", null])(
    "uses tuteo for auto country %s",
    (country) => {
      expect(resolveRegister({ locale: "es", country })).toBe("tuteo");
    },
  );

  it("lets an explicit register override country defaults", () => {
    expect(
      resolveRegister({ locale: "es", setting: "tuteo", country: "AR" }),
    ).toBe("tuteo");
    expect(
      resolveRegister({ locale: "es", setting: "voseo", country: "PE" }),
    ).toBe("voseo");
  });

  it("ignores register and country for English", () => {
    expect(
      resolveRegister({ locale: "en", setting: "voseo", country: "AR" }),
    ).toBe("tuteo");
  });

  it.each(["", "<script>", "T1", "XX"])(
    "falls back to tuteo for invalid country %s",
    (country) => {
      expect(resolveRegister({ locale: "es", country })).toBe("tuteo");
    },
  );
});

describe("resolveStoreCountry", () => {
  it("prefers store country, then owner country, then Peru", () => {
    expect(
      resolveStoreCountry({ countryCode: "AR" }, { countryCode: "PE" }),
    ).toBe("AR");
    expect(
      resolveStoreCountry({ countryCode: null }, { countryCode: "UY" }),
    ).toBe("UY");
    expect(resolveStoreCountry({ countryCode: "bad" }, null)).toBe("PE");
  });
});
