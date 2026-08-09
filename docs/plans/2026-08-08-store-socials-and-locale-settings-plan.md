# Store social links + default locale settings

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`).

## Context

Two independent, small additions to `Store`, bundled into one plan because both
are "add a settings field + surface it" shaped and both touch
`ProfileSection`/`DefaultsSection`. Confirmed via investigation:

- `Store` (`packages/db/prisma/schema.prisma:31-64`) has **no social-link fields
  at all** (no Instagram/Facebook/TikTok/Twitter/anything) — the only
  contact-style field is `whatsappNumber`. Grep for
  `facebook|instagram|tiktok|social` across `apps/api/src/modules/stores/`
  returns nothing.
- `Store.locale` (`schema.prisma:35`, default `"es"`) **already exists** in the
  schema but is **never surfaced or edited anywhere** in
  `apps/web/features/store-settings/` — confirmed via full read of
  `profile-section.tsx` and `defaults-section.tsx`, neither registers a `locale`
  field. This half of the plan is "expose an existing column," not a schema
  change.
- No footer or social-link rendering exists anywhere in the storefront tree
  (`apps/web/app/[locale]/(storefront)/store/[slug]/page.tsx` full read,
  `apps/web/components/storefront/` — no footer component found). The public
  store header (`page.tsx:180-188` / `210-218`, `StoreLogo` + `store.name`) is
  the natural place to add social icons.
- The user's stated motivation for `locale` includes "so we know how to speak to
  the clients" — i.e. this isn't just a display-language toggle, it's meant to
  inform default copy (e.g. which language template a WhatsApp message defaults
  to, per `2026-08-08-configurable-whatsapp-templates-plan.md`). Keep that
  connection in mind but don't build cross-plan wiring here — just make `locale`
  a real, editable, persisted field; the templates plan is responsible for
  reading it.

## Decision: social-link shape

Add a small fixed set of nullable string columns rather than an open `Json` blob
(this repo already has one under-specified `Json` field
(`PaymentMethodConfig.details`) causing real friction — see
`2026-08-08-buyer-post-checkout-payment-instructions-plan.md`'s Context — don't
repeat that pattern for a field set that's actually fixed and known today):

```prisma
model Store {
  // ...existing fields
  instagramUrl String?
  facebookUrl  String?
  tiktokUrl    String?
  twitterUrl   String?  // "X", keep the field name matching existing convention (whatsappNumber, not "xNumber")
}
```

Four fields, all optional URLs (validate `@IsUrl()` on the DTO, allow empty
string → `null` on save, matching the existing pattern for `Store.logoUrl?`). If
a fifth platform is needed later, add it the same way — resist a generic
`socialLinks: Json` "for flexibility," per this repo's stated anti-abstraction
bias in `CLAUDE.md`.

## Backend changes

1. Prisma migration: four new nullable `String` columns on `Store`.
2. Find the existing store-update DTO/service used by `ProfileSection`'s save
   mutation (`apps/web/features/store-settings/mutations/use-save-profile.ts` →
   whichever `apiClient.stores.*` call it makes — check
   `apps/api/src/modules/stores/dto/` for the matching update DTO) and add the
   four URL fields + `locale`. **`packages/i18n/` has exactly two locales today
   (`en/`, `es/`) — confirmed via directory listing** — use
   `@IsIn(["es", "en"])` directly, no need to hedge against a third locale that
   doesn't exist.
3. **All three read paths — public storefront, settings-page reload, and admin
   store list — share one choke point: add the four fields there once, not three
   times.** Every store-returning endpoint (`findAllForAdmin`,
   `findPublicBySlug`, `MyStoresController`, etc.) maps through
   `stores.mapper.ts`'s `toStoreDto`, which explicit-maps a hand-typed
   `StoreRow` whitelist — **not** a raw Prisma passthrough. Add the four social
   fields (and `locale`, if not already exposed) to `StoreRow` and `toStoreDto`.
   Skipping this is the real failure mode to watch for: the columns would
   persist to Postgres but silently vanish from every API response, including
   the settings page's own reload right after save.
4. **Admin store list gets these columns for free, no separate backend work
   needed** — confirmed
   `apps/web/features/admin/components/admin-stores-table.tsx` (backed by
   `StoresService.findAllForAdmin()`, `stores.service.ts:65-70`, rendering
   `StoreWithOwnerResponseDto extends StoreResponseDto`) already does an
   unrestricted `findMany`. Once step 3 lands, add two `<th>`/`<td>` columns +
   i18n labels to `admin-stores-table.tsx` in the same PR — small, no reason to
   defer it.
5. Regenerate OpenAPI + Orval client.

## Frontend changes

1. `ProfileSection`
   (`apps/web/features/store-settings/components/profile-section.tsx`) — add
   four URL `Input` fields (Instagram/Facebook/TikTok/Twitter) to the existing
   form, same `register()` pattern already used for
   `whatsappNumber`/`paymentInstructions`. Add `locale` as a `Select` (reuse the
   `Select` component already used elsewhere in this file for `defaultCurrency`)
   — options are exactly `es`/`en`, confirmed above.
2. `profile.schema.ts` — extend `profileFormSchema` (zod) with the four optional
   URL fields and `locale`. **No existing precedent to copy for either —
   confirmed via repo-wide grep that neither `@IsUrl()` (backend) nor
   `.url()`/`z.literal("")` (frontend) appears anywhere in this codebase
   today**, and `Store.logoUrl` isn't a real precedent either since it's set
   through a separate file-upload mutation (`use-upload-store-logo.ts`), never a
   text `Input` + zod URL schema. Use `class-validator`'s `@IsUrl()` on the
   backend DTO and zod's `.url().optional().or(z.literal(""))` on the frontend
   directly — first use of either pattern in this repo, not a copy of an
   existing one.
3. Public store page
   (`apps/web/app/[locale]/(storefront)/store/[slug]/page.tsx:180-188`,
   `210-218`) — render small social icons next to the store header when the
   corresponding URL is set (conditionally, one per configured platform). **No
   brand-icon set is available to reuse**: the installed `lucide-react` version
   ships zero brand/social icons — use plain text/generic links, this isn't an
   open decision to check at implementation time. Do not add a new icon-library
   dependency for four icons; check what's already imported elsewhere in this
   file/`components/storefront/` first.
4. i18n: new labels for the four social fields + locale selector, in
   `packages/i18n/es/` + English counterpart.

## Non-goals

- Not building per-buyer language preference — `locale` here is a
  **store-level** default only, matching the existing schema field's shape (one
  locale per store, same as `User.locale`, per the investigation: "Neither is
  currently surfaced/edited"). Per-buyer locale is a different, unscoped
  feature.
- Not validating that social URLs actually belong to the claimed platform (e.g.
  checking an "instagramUrl" is really an instagram.com link) — plain URL format
  validation only.
- Not building a _new_ admin reporting surface for social links — the existing
  `admin-stores-table.tsx` list gets two new columns (Backend changes step 4
  above), which is enough to satisfy the user's "so we as admins... know our
  customers" motivation. No new admin page.

## Files likely touched

- `packages/db/prisma/schema.prisma` + migration
- `apps/api/src/modules/stores/` (update DTO, service, `stores.mapper.ts`'s
  `StoreRow`/`toStoreDto` — the one shared choke point for all read paths)
- `apps/web/features/store-settings/components/profile-section.tsx`,
  `schemas/profile.schema.ts`
- `apps/web/app/[locale]/(storefront)/store/[slug]/page.tsx`
- `apps/web/features/admin/components/admin-stores-table.tsx` (two new columns)
- `apps/api/openapi.json` + `packages/types/generated/**`
- `packages/i18n/es/`, `packages/i18n/en/`

## Verification

- `pnpm --filter api test` for the store-update service's new fields.
- Manual: set all four social URLs + change locale in settings, confirm they
  save and reload correctly (existing `useSavedFlash` "Saved" flash should fire
  the same as other fields in this section); confirm the public store page
  renders icons only for configured platforms; confirm an invalid URL is
  rejected client-side before submit.
- `pnpm typecheck`.

## Definition of done

A seller can set Instagram/Facebook/TikTok/Twitter links and a default store
locale from Settings; configured social links render as clickable icons on the
public store page; `locale` is persisted and readable by other features (e.g.
the WhatsApp-templates plan) going forward.

## Execution notes

- **Branch**: Dedicated branch `feat/store-socials-and-locale` created from
  up-to-date `main`.
- **Database & Schema**:
  - Added `instagramUrl`, `facebookUrl`, `tiktokUrl`, and `twitterUrl` nullable
    string columns to `Store` model in `packages/db/prisma/schema.prisma`.
  - Created migration `20260809210000_add_store_socials` and ran
    `prisma generate`.
- **Backend API**:
  - Updated `UpdateStoreDto`
    (`apps/api/src/modules/stores/dto/update-store.dto.ts`) with
    `@IsIn(["es", "en"])` for `locale` and `@IsUrl()` + `@ValidateIf` for the 4
    social fields.
  - Updated `StoresService.update` to map empty string values to `null`.
  - Updated `StoreRow` and `toStoreDto` in
    `apps/api/src/modules/stores/stores.mapper.ts` as the single choke point for
    all store read paths.
  - Updated `StoreResponseDto` in
    `apps/api/src/modules/stores/dto/store-response.dto.ts`.
  - Regenerated `openapi.json` and `@biasmarket/types`.
- **Frontend & i18n**:
  - Updated `dashboardStoreSchema`
    (`apps/web/features/stores/schemas/dashboard-store.schema.ts`).
  - Extended `profileFormSchema`
    (`apps/web/features/store-settings/schemas/profile.schema.ts`) with
    `z.string().url().optional().or(z.literal(""))` for social URLs and
    `z.enum(["es", "en"])` for locale.
  - Updated `ProfileSection` form component
    (`apps/web/features/store-settings/components/profile-section.tsx`) to
    surface the `locale` select and 4 social link inputs with client-side Zod
    validation errors.
  - Added `StoreSocialLinks` component to public storefront page header
    (`apps/web/app/[locale]/(storefront)/store/[slug]/page.tsx`).
  - Added `locale` and `socials` columns to `AdminStoresTable`
    (`apps/web/features/admin/components/admin-stores-table.tsx`).
  - Added i18n labels in Spanish (`es/dashboard.json`, `es/admin.json`) and
    English (`en/dashboard.json`, `en/admin.json`).
- **Testing & Verification**:
  - Added unit test cases for updating `locale` and social links in
    `stores.service.spec.ts`.
  - Ran `pnpm --filter api test`: all 381 tests across 43 test files passed
    cleanly.
  - Ran `pnpm typecheck`: typecheck passed cleanly with zero errors across all
    monorepo packages.
