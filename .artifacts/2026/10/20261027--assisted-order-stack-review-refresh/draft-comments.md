# Draft follow-up comments (not posted)

Existing PR review threads already cover the findings that were fixed by the
latest pushes. Do not duplicate them. The items below are new candidates from
this refresh; verify against the final heads and existing threads before any
posting.

## #325: feat(orders): endpoint para crear pedido asistido

**Review body (COMMENT):**

> Re-review found a mismatch between the contact name and the alias used for
> assisted-order lookup. The repeat-order case needs to preserve a registered
> buyer's canonical name while returning the latest seller-entered alias.

### 325-1 · should fix · `apps/api/src/modules/orders/application/assisted-customer.ts:44`

> #258 says the contact stores the last alias, but this update only runs while
> `Customer.name` is null. On a repeat assisted order with a different alias,
> the stored first name wins; `lookupByPhone` then returns `customer.name`
> before the latest order alias. This leaves the form prefilling stale text.
> Please preserve a registered buyer's canonical name while ensuring lookup
> returns the latest assisted-order alias, and add a repeat-order regression
> test. The acceptance wording may need to change if the alias is stored
> separately from `Customer.name`.

## #326: feat(orders): regenerar enlace y corregir número de pedido asistido

**Review body (COMMENT):**

> The seller-only DTO fields, creator projections, and race/boundary tests are
> now present. One failure path still returns an order after the first-open
> lockout could not be recorded.

### 326-5 · should fix · `apps/api/src/modules/orders/application/public-order.service.ts:103`

> This catch consumes any failure in the first-open transaction and continues to
> return the order page. If a valid current-token request is served but the
> marker/event write rolls back, `linkFirstOpenedAt` stays null and the
> phone-correction endpoint can still accept a change after the buyer received
> the page. Since #265 uses that marker as the correction gate, please fail
> closed on tracking-write failure and change the unit test that currently
> expects a 200 in this case.

## #329: feat(assisted-orders): formulario de nuevo pedido asistido

**Review body (COMMENT):**

> Re-review found one additional form edge case around quantities. The stock
> limit is currently a browser hint and changing the selected product or variant
> keeps the old quantity. Details below.

### 329-5 · should fix · `apps/web/features/assisted-orders/components/order-item-row.tsx:191`

> `max` is only an input hint, and this handler writes any entered number into
> the form. Since the form uses `noValidate`, typing a quantity above available
> stock can reach the submit path and fail at the API; changing the product or
> variant also preserves the old quantity. Clamp or validate the typed value and
> reset/clamp quantity when the selection changes, then cover both cases in the
> component test.

## #331: feat(assisted-orders): acciones de enlace en el detalle del pedido

**Review body (COMMENT):**

> The main order actions correctly disappear for cancelled orders. One
> retained-state edge case remains if cancellation arrives after a link was
> generated.

### 331-1 · question · `apps/web/features/assisted-orders/components/assisted-order-section.tsx:218`

> If the seller generates a link and this mounted sheet later receives a
> cancelled order, `closed` replaces the regenerate controls but `result`
> remains set and still renders `LinkMessagePanel` with WhatsApp/copy actions.
> Should a cancelled order keep offering that prior link? I suggest clearing or
> hiding the result when the order becomes cancelled, with a test for
> cancellation after link generation.

### 331-2 · should fix · `apps/web/features/assisted-orders/components/assisted-order-section.tsx:61`

> `closed` only checks cancellation statuses. For a reserved hold whose
> `expiresAt` has passed, the API refuses link operations with 409, but the
> detail section still enables send and correction until the background expiry
> sweep changes the order status. Apply the same hold-status expiry rule in the
> UI and cover the exact expiry boundary so sellers do not hit an avoidable 409.
