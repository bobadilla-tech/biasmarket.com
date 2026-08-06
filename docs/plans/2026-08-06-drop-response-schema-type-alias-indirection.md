# Drop response-DTO type-alias indirection in `apps/web/features/*/schemas/*.ts`

## Context

`docs/plans/2026-08-06-orval-rollout-batches-5-6-plan.md` (and every batch
before it) migrated feature response reads off hand-written zod schemas onto the
generated Orval client. The recipe each batch followed was "drop response-shape
zod for plain pass-through reads" — but in practice, dropping the zod schema
left behind a type alias in its place instead of deleting the file outright,
e.g. `features/account/schemas/confirm-result.schema.ts`:

```ts
import type {
  AccountOrderResponseDto,
  ConfirmAccountResponseDto,
} from "@biasmarket/types";

export type AccountOrder = AccountOrderResponseDto;
export type ConfirmResult = ConfirmAccountResponseDto;
```

This made sense as a mechanical, low-risk replacement step while the rollout was
in flight (rename the zod-inferred type to a DTO-aliased type, touch nothing
else). It stopped making sense once the rollout finished: the file now exists
only to rename an import. Every consumer already has to know the real DTO name
to find its fields (autocomplete/go-to-definition resolves through the alias
anyway), so the alias buys nothing and costs a file, an extra hop, and a
locally-invented short name that can drift from the actual API contract name
over time.

Flagged by the user while reviewing
`features/account/schemas/confirm-result.schema.ts` directly: "Couldn't we just
simply import the type directly?" — yes. This doc is the plan for doing that
across every feature that has the same leftover pattern.

## Scope

19 `features/*/schemas/*.ts` files import from `@biasmarket/types`. Two groups:

### Pure alias-only — delete the file entirely

| File                                                    | Aliases                                          |
| ------------------------------------------------------- | ------------------------------------------------ |
| `features/account/schemas/confirm-result.schema.ts`     | `AccountOrder`, `ConfirmResult`                  |
| `features/admin/schemas/admin-store.schema.ts`          | `AdminStore`                                     |
| `features/admin/schemas/inquiry.schema.ts`              | `Inquiry`                                        |
| `features/customer-auth/schemas/profile.schema.ts`      | `CustomerProfile`, `UpdateCustomerProfileResult` |
| `features/customers/schemas/customer.schema.ts`         | `CustomerListItem`, `CustomerDetail`             |
| `features/discovery/schemas/product-search.schema.ts`   | `SearchProduct`, `ProductSearchResult`           |
| `features/discovery/schemas/store-listing.schema.ts`    | `StoreListing`, `StoreDirectoryResult`           |
| `features/notifications/schemas/notification.schema.ts` | `NotificationItem`, `UnreadCount`                |
| `features/orders/schemas/order.schema.ts`               | `OrderItemRow`, `OrderPaymentRow`, `Order`       |
| `features/products/schemas/category.schema.ts`          | `Category`                                       |
| `features/products/schemas/product.schema.ts`           | `Product`                                        |
| `features/suggestions/schemas/suggestion.schema.ts`     | `Suggestion`                                     |

### Mixed — strip only the dead alias line(s), keep the real content

| File                                                | Drop                                                        | Keep (not a generated DTO — out of scope)                              |
| --------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `features/admin/schemas/admin-user.schema.ts`       | `StoreCount`                                                | `AdminUser` interface (hand-rolled)                                    |
| `features/checkout/schemas/checkout.schema.ts`      | `CheckoutResult`                                            | `buildCheckoutFormSchema`, `CheckoutFormInput`                         |
| `features/collections/schemas/collection.schema.ts` | `Collection`, `CollectionProduct`                           | `createCollectionSchema`, `CreateCollectionInput`                      |
| `features/products/schemas/variant.schema.ts`       | `Variant`                                                   | `VariantDraft`, `OptionTypeDraft`                                      |
| `features/sections/schemas/section.schema.ts`       | `StoreSection`, `SectionType`                               | `sectionFormSchema`, `SectionFormInput`                                |
| `features/stats/schemas/analytics.schema.ts`        | `AnalyticsBucket`, `AnalyticsTopProduct`, `AnalyticsResult` | `analyticsRangeValues`, `AnalyticsRange`                               |
| `features/stats/schemas/stats-overview.schema.ts`   | `RecentOrder`, `StatsOverview`                              | `paymentStatusValues`, `fulfillmentStatusValues` and their value types |

`SectionType = StoreSection["type"]` is a derived type, not a standalone import
— after `StoreSection` is dropped, redefine it as
`StoreSectionResponseDto["type"]` wherever it's still needed (check consumers
before deciding whether it's needed at all).

## Approach

Per alias `X = YResponseDto`:

1. `git grep -n '\bX\b' -- apps/web` to find every consumer — both direct
   imports (`from "../schemas/whatever.schema"`) and cross-feature barrel
   imports (`from "@/features/<name>"`, since the type is very likely
   re-exported from that feature's `index.ts`).
2. In every consumer: import `YResponseDto` from `"@biasmarket/types"` instead,
   and rename every use of `X` to `YResponseDto` — type annotations, function
   params, `Pick<X, ...>`, indexed-access types like `X["someField"]`, generic
   type arguments.
3. Remove `X`'s re-export line from that feature's `index.ts` barrel.
4. Delete the schema file if nothing real is left in it (pure-alias case);
   otherwise leave the remaining real content untouched.

### Known cross-feature case

`AccountOrder` (from `features/account`) is imported directly by
`features/customer-auth/components/customer-profile-view.tsx` — a different
feature importing `features/account`'s re-export of a type neither feature
actually owns. After this change, both
`features/account/components/account-confirm-view.tsx` and
`features/customer-auth/components/customer-profile-view.tsx` import
`AccountOrderResponseDto` from `@biasmarket/types` directly — no cross-feature
dependency left for this type at all.

### Widest blast radius

`Order` (from `features/orders`) is used in roughly 14 files repo-wide.
`features/customers` and `features/stats` already import `OrderResponseDto`
directly (written after this indirection problem was noticed mid-rollout — Batch
5/6 — so don't touch those two, just confirm they're already correct). The files
still needing the update are mainly inside `features/orders` itself (components,
`OrderStatusBadge`'s `Pick<Order, "paymentStatus" | "fulfillmentStatus">`) and
`features/customers/components/customer-detail-sheet.tsx`, which imports
`OrderStatusBadge` from `@/features/orders`.

## Out of scope

- Any `schemas/*.ts` file that's real zod (request/form validation) with no
  alias in it at all — `login.schema.ts`, `register.schema.ts`,
  `create-store.schema.ts`, `buildRegisterPaymentSchema`, etc. — untouched.
- `packages/types/generated/**` — Orval output, regenerated, never hand-edited.
- `apps/api` — this is a frontend-only cleanup, zero backend changes.
- `features/stats/api/stats.api.ts` and
  `features/stats/schemas/payment-methods.schema.ts`, if encountered while
  working in `features/stats`: a separate, pre-existing dead-code situation
  (`StatsService.getPaymentMethodsBreakdown` landed via a merge from `main` with
  no controller route wired to it, and the frontend's old `stats.api.ts` came
  back from the same merge alongside it, referenced by nothing but its own
  test). Not part of this task — leave exactly as found.

## Verification

```bash
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

Then confirm the cleanup is complete:

```bash
grep -rln 'from "@biasmarket/types"' apps/web/features/*/schemas/*.ts
```

should list only the 7 mixed files above, and

```bash
grep -rn 'export type \w\+ = \w\+ResponseDto' apps/web/features/*/schemas/*.ts
```

should return zero matches anywhere.

## Execution notes

Append here once this lands — which files were deleted, which were stripped, and
the consumer-file count touched per type, checkable against the tables above.
