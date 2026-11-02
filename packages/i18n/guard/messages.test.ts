import { expect, test } from "vitest";
import { getMessages } from "../index.js";
import { getMobileMessages } from "../mobile.js";

test("getMessages overlays selected Spanish strings and memoizes the result", () => {
  const base = getMessages("es", "tuteo");
  const voseo = getMessages("es", "voseo");

  expect(voseo.onboarding.createStore.title).toBe("Creá tu tienda");
  expect(voseo.dashboard.settings.title).toBe(base.dashboard.settings.title);
  expect(getMessages("es", "voseo")).toBe(voseo);
});

test("English ignores register", () => {
  expect(getMessages("en", "voseo")).toBe(getMessages("en", "tuteo"));
});

test("mobile messages use the same overlay and merge helper", () => {
  const base = getMobileMessages("es", "tuteo");
  const voseo = getMobileMessages("es", "voseo");

  expect(voseo.auth.registerTitle).toBe("Creá tu cuenta");
  expect(voseo.common.brandName).toBe(base.common.brandName);
  expect(getMobileMessages("es", "voseo")).toBe(voseo);
  expect(getMobileMessages("en", "voseo")).toBe(getMobileMessages("en"));
});
