import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installLocalStorage } from "../../../test-utils/local-storage";
import { inviteStorage } from "./invite-storage";

let storage: Storage;

beforeEach(() => {
  storage = installLocalStorage();
  inviteStorage.clearMemory();
});
afterEach(() => vi.restoreAllMocks());

test("remembers the first-seen flag and the dismissal per store and order number", () => {
  expect(inviteStorage.getFirstSeen("k-store", "ABCD12")).toBe(false);
  inviteStorage.setFirstSeen("k-store", "ABCD12");
  expect(inviteStorage.getFirstSeen("k-store", "ABCD12")).toBe(true);
  expect(inviteStorage.getFirstSeen("other", "ABCD12")).toBe(false);
  expect(inviteStorage.getFirstSeen("k-store", "ZZ99")).toBe(false);

  expect(inviteStorage.getDismissedAt("k-store", "ABCD12")).toBeNull();
  inviteStorage.setDismissedAt("k-store", "ABCD12", 1234);
  expect(inviteStorage.getDismissedAt("k-store", "ABCD12")).toBe(1234);
});

test("keys never contain the order token, only slug and order number", () => {
  inviteStorage.setFirstSeen("k-store", "ABCD12");
  inviteStorage.setDismissedAt("k-store", "ABCD12", 1);
  const keys = [...Array(storage.length).keys()].map((i) => storage.key(i)!);
  expect(keys.length).toBe(2);
  for (const key of keys) expect(key).toMatch(/^bm-invite:k-store:ABCD12:/);
});

test("falls back to memory when storage throws (private mode, WebView)", () => {
  vi.spyOn(storage, "getItem").mockImplementation(() => {
    throw new Error("denied");
  });
  vi.spyOn(storage, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  expect(() => inviteStorage.setFirstSeen("k-store", "ABCD12")).not.toThrow();
  expect(inviteStorage.getFirstSeen("k-store", "ABCD12")).toBe(true);
  expect(inviteStorage.getDismissedAt("k-store", "ABCD12")).toBeNull();
  inviteStorage.setDismissedAt("k-store", "ABCD12", 99);
  expect(inviteStorage.getDismissedAt("k-store", "ABCD12")).toBe(99);
});

test("a corrupted dismissal value reads as not dismissed", () => {
  storage.setItem("bm-invite:k-store:ABCD12:dismissedAt", "banana");
  expect(inviteStorage.getDismissedAt("k-store", "ABCD12")).toBeNull();
});

test("works with no localStorage at all (it can be undefined or blocked)", () => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    },
  });
  expect(() => inviteStorage.setFirstSeen("k-store", "ABCD12")).not.toThrow();
  expect(inviteStorage.getFirstSeen("k-store", "ABCD12")).toBe(true);
});
