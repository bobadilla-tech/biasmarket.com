# Pickup-point weekday availability — dashboard editor UI

## Context

Issue 3b of the four-issue batch plan
(`2026-08-06-order-status-buyer-login-pickup-checkout-fixes-plan.md`) — the
seller-facing UI consuming issue 3a's `PickupPoint.openDays`/ `closedOverride`
API surface (`2026-08-06-pickup-point-availability-schema-and-api.md`). Landed
as its own PR since it depends on 3a's API existing first; the storefront-facing
consumer (day-availability badges on checkout's pickup-point cards) is issue 4,
a later PR still.

## Approach

- **Sheet, not an inline-expanding row** — `delivery-section.tsx`'s pickup-point
  rows were a single flat `flex` div with no room for 7 weekday checkboxes.
  Reused the `Sheet` primitive already established by `order-detail-sheet.tsx`
  for the same reason that component picked it: UI consistency with the one
  other place this repo already opens a per-row detail panel. A single Sheet
  instance is shared across all rows (an `editingPointId` state, same pattern as
  `orders-page-client.tsx`'s `selectedOrderId`), not one Sheet per row.
- **Local state until "Guardar"** — day toggles and the closedOverride switch
  write into the same local `pickupPoints` component state the existing
  enabled/label fields already use; nothing hits the API until the section's own
  Save button, matching every other field in this form.
- **Two silent-drop traps closed** (both called out explicitly by the original
  investigation, confirmed via review that issue 3a's Orval regen does not touch
  either): the hand-written `PickupPoint` interface in `delivery.schema.ts`
  (mirrors `PickupPointResponseDto` by hand, per its own comment) now carries
  `openDays`/`closedOverride`, and `settings.api.ts`'s `saveDeliverySettings` —
  which explicitly whitelists fields per API call rather than spreading the
  whole object — now passes both through to `pickupPoints.create`/`.update`.
  Without both fixes the new UI fields would type-check fine locally and then
  silently vanish before ever reaching the API.

## What else came up

- **First Base UI `Switch` click in any test in this repo.** jsdom has no
  `PointerEvent` constructor; Base UI's `Switch` reads
  `ownerWindow(...).PointerEvent` directly in its click handler, so
  `userEvent.click()` on one threw `TypeError: ... is not a constructor`. Added
  a minimal `PointerEvent` polyfill (a `MouseEvent` subclass with the handful of
  properties Base UI actually reads) to the shared `vitest.setup.ts` rather than
  the one test file, since any future test clicking a `Switch` — of which this
  repo already has several outside this PR — would hit the same wall.
- **Verification hit real environment friction, documented rather than worked
  around silently.** Per CLAUDE.md's UI-change guidance, ran the real dev
  servers and drove the browser: logged in as the seeded seller, confirmed the
  delivery section renders three real pickup points with the new
  "Disponibilidad" control and correct default "Todos los días" summary
  (screenshot). No `playwright`/`puppeteer` is installed in this sandbox, so
  drove headless Chrome directly over the DevTools Protocol with a small
  throwaway script — opening the sheet, toggling a weekday off, toggling
  `closedOverride` on, and closing it correctly updated the row's summary text
  to "No disponible ahora" exactly as expected. A headless-Chrome session
  flakiness (an intermittent client-side stall on hard page reloads — reproduced
  even on the _unmodified_ settings page in isolation, so unrelated to this
  change) made continuing the same automated session past that point unreliable.
  Rather than fight the automation harness further, confirmed the save path's
  actual persistence by issuing the identical HTTP `PATCH`
  `saveDeliverySettings` sends directly against the running dev API (same
  payload shape, `{label, enabled, sortOrder, openDays, closedOverride}`) and
  verifying the row in the database — full round-trip confirmed, then restored
  the seed row to its default state afterward.

## Tests

- `delivery-section.test.tsx` (new — none existed before): renders the section
  against a mocked API, opens a point's availability sheet, toggles a weekday
  off and `closedOverride` on, closes the sheet, saves, and asserts
  `pickupPoints.update` was called with the exact resulting
  `openDays`/`closedOverride` payload.
- `settings.api.test.ts`: updated fixtures to include `openDays`/
  `closedOverride` on both the "new point" and "existing point" cases, and
  asserts both fields now reach `pickupPoints.create`/`.update` instead of being
  silently stripped by the old whitelist.
