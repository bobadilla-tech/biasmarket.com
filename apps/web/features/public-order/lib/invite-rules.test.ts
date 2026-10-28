import { expect, test } from "vitest";
import { INVITE_CONFIG, type InviteConfig } from "./invite-config";
import { pickInviteMoment, type InviteInput } from "./invite-rules";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 28, 12);

const base = (patch: Partial<InviteInput> = {}): InviteInput => ({
  order: {
    status: "ACTIVE",
    paymentStatus: "VERIFIED",
    fulfillmentStatus: "ORDERING",
    hasValidatedPayment: true,
    claimed: false,
  },
  firstSeen: false,
  dismissedAt: null,
  now: NOW,
  receiptJustConfirmed: false,
  ...patch,
});
const withOrder = (
  patch: Partial<InviteInput["order"]>,
  rest: Partial<InviteInput> = {},
) => base({ order: { ...base().order, ...patch }, ...rest });

test("no validated payment, no invitation", () => {
  expect(
    pickInviteMoment(withOrder({ hasValidatedPayment: false })),
  ).toBeNull();
  expect(
    pickInviteMoment(withOrder({ hasValidatedPayment: undefined })),
  ).toBeNull();
});

test("a validated payment on the first open shows the first-validation block", () => {
  expect(pickInviteMoment(base())).toBe("pago_validado");
});

test("later visits show the banner", () => {
  expect(pickInviteMoment(base({ firstSeen: true }))).toBe("banner");
});

test.each([
  ["cancelled", { status: "CANCELLED" as const }],
  [
    "expired (payment status cancelled)",
    { paymentStatus: "CANCELLED" as const },
  ],
  ["rejected", { paymentStatus: "REJECTED" as const }],
  ["already claimed", { claimed: true }],
])("never invites a %s order, whatever else is true", (_label, patch) => {
  for (const extra of [
    {},
    { firstSeen: true },
    { receiptJustConfirmed: true },
  ]) {
    expect(
      pickInviteMoment(
        withOrder({ ...patch, fulfillmentStatus: "COMPLETED" }, extra),
      ),
    ).toBeNull();
  }
});

test("'Ahora no' hides the banner for seven days, then it returns", () => {
  expect(
    pickInviteMoment(base({ firstSeen: true, dismissedAt: NOW - 6 * DAY })),
  ).not.toBe("banner");
  expect(
    pickInviteMoment(base({ firstSeen: true, dismissedAt: NOW - 8 * DAY })),
  ).toBe("banner");
});

test("a dismissal also holds back the first-validation block", () => {
  expect(
    pickInviteMoment(base({ firstSeen: false, dismissedAt: NOW - DAY })),
  ).not.toBe("pago_validado");
});

test("delivery shows even if the banner was dismissed", () => {
  expect(
    pickInviteMoment(
      withOrder(
        { fulfillmentStatus: "COMPLETED" },
        { firstSeen: true, dismissedAt: NOW - DAY },
      ),
    ),
  ).toBe("entrega");
});

test("confirming receipt shows the delivery moment, dismissed or not", () => {
  expect(pickInviteMoment(base({ receiptJustConfirmed: true }))).toBe(
    "entrega",
  );
  expect(
    pickInviteMoment(
      base({
        receiptJustConfirmed: true,
        firstSeen: true,
        dismissedAt: NOW - DAY,
      }),
    ),
  ).toBe("entrega");
});

test("priority: entrega beats the first-validation block, which beats the banner", () => {
  // Delivered AND never seen: delivery wins.
  expect(pickInviteMoment(withOrder({ fulfillmentStatus: "COMPLETED" }))).toBe(
    "entrega",
  );
  // Not delivered, never seen: first-validation block, not the banner.
  expect(pickInviteMoment(base())).toBe("pago_validado");
});

test("after a dismissal the quiet history line remains (and only one moment is ever returned)", () => {
  expect(
    pickInviteMoment(base({ firstSeen: true, dismissedAt: NOW - DAY })),
  ).toBe("adelanto_linea_de_tiempo");
  const moment = pickInviteMoment(base());
  expect(typeof moment).toBe("string");
});

test("the dismissal window and the moments come from the config only", () => {
  const short: InviteConfig = { ...INVITE_CONFIG, dismissDays: 1 };
  expect(
    pickInviteMoment(
      base({ firstSeen: true, dismissedAt: NOW - 2 * DAY, config: short }),
    ),
  ).toBe("banner");

  const noAdelanto: InviteConfig = {
    ...INVITE_CONFIG,
    adelantoAfterDismiss: false,
  };
  expect(
    pickInviteMoment(
      base({ firstSeen: true, dismissedAt: NOW - DAY, config: noAdelanto }),
    ),
  ).toBeNull();

  const noBanner: InviteConfig = {
    ...INVITE_CONFIG,
    priority: ["entrega", "pago_validado"],
  };
  expect(
    pickInviteMoment(base({ firstSeen: true, config: noBanner })),
  ).toBeNull();

  // Without the first-validation block the banner covers the first visit.
  const noFirst: InviteConfig = {
    ...INVITE_CONFIG,
    priority: ["entrega", "banner"],
  };
  expect(pickInviteMoment(base({ config: noFirst }))).toBe("banner");
});
