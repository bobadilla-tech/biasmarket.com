# Adopt URL-prefixed i18n routing (next-intl)

## Context

Audited the repo's i18n state against Next.js's official app-router i18n guide
(pasted by the user) and the pre-existing `docs/spec/i18n.md`. Found a three-way
mismatch:

- **The guide** describes `app/[lang]/...` URL-prefixed routing + a
  `getDictionary()` loader. Confirmed still accurate for the installed Next.js
  16.2.10 — `middleware.ts` is deprecated in favor of `proxy.ts` per
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`,
  matching the guide's `proxy.js`/`proxy()` naming.
- **`docs/spec/i18n.md`** (written earlier, never implemented) explicitly
  _rejected_ URL-prefixed routing for MVP, calling instead for `next-intl` with
  locale resolved server-side from `User.locale`/`Store.locale`, no `[locale]`
  segment.
- **Actual code** matched neither: a client-only React Context + `localStorage`
  toggle (`apps/web/components/landing/language-provider.tsx`, built earlier the
  same day for the landing page only) defaulting to `"es"`, no SSR awareness.
  Every other route (`(dashboard)`, `(onboarding)`, `(storefront)`) had raw
  hardcoded strings, inconsistently mixed ES/EN. `User.locale`/`Store.locale`
  already existed in `packages/db/prisma/schema.prisma` (both `@default("es")`)
  but nothing read or wrote them. `apps/api` had zero locale/i18n code anywhere.

User's call, given three explicit choices: override the spec's no-prefix MVP
decision and follow the guide's URL-prefix pattern; adopt `next-intl` over a
hand-rolled dictionary loader (ICU pluralization/formatting for free); and do a
full migration in one pass rather than landing-only.

## Decisions

- **`app/[locale]/...` URL-prefix, not server-resolved no-prefix.** Reverses
  `docs/spec/i18n.md`'s original MVP call. Applies uniformly to landing,
  dashboard, onboarding, and storefront — no split between "auth-gated, no
  prefix needed" and "public, needs a prefix," since the URL segment is now the
  single source of truth everywhere.
- **`User.locale`/`Store.locale` stay as stored preferences, not routing
  authority.** They're read nowhere at runtime for rendering decisions — kept in
  the schema for future use (e.g. what a login redirect or a freshly generated
  store link defaults to), so there's no case where a DB field and the URL
  disagree about what to render.
- **`next-intl`'s own `createMiddleware` handles Accept-Language negotiation**,
  re-exported as `proxy` from `apps/web/proxy.ts` — no need to hand-roll
  `negotiator`/`@formatjs/intl-localematcher` per the raw guide; next-intl's
  middleware already implements that matching and is what the spec wanted
  anyway.
- **Backend localization stays out of scope.** No email feature exists to
  localize, and validation-message translation lives in a different layer
  (`apps/api` DTOs) than what was asked (frontend UI copy). Left as a documented
  follow-up in `docs/spec/i18n.md` rather than silently expanded into.
- **`common.json` stays minimal** (loading/error fallbacks, page metadata)
  instead of becoming a catch-all — new `dashboard.json`/`onboarding.json`/
  `storefront.json` namespaces hold everything specific to those surfaces,
  matching the spec's namespacing intent. `emails.json` was not created —
  nothing to migrate yet.
- **`apiFetch` (apps/web/lib/api.ts) takes an optional localized fallback
  message** instead of a hardcoded Spanish string — it's a plain async function,
  not a component, so it can't call `useTranslations` itself; callers pass
  `tCommon("networkError")` instead.

## What changed

**Created:**

- `packages/i18n/{en,es}/{dashboard,onboarding,storefront}.json` — extracted
  from every hardcoded string found in the dashboard products page, login,
  signup, create-store, and storefront pages (including `product-card.tsx`/
  `cart-link.tsx`, missed by the first audit pass since it only read
  `page.tsx`).
- `apps/web/i18n/routing.ts`, `request.ts`, `navigation.ts` — next-intl's
  `defineRouting`/`getRequestConfig`/`createNavigation` setup.
- `apps/web/proxy.ts` — next-intl middleware, matcher excludes `_next`, api,
  static assets.
- `apps/web/global.d.ts` — augments next-intl's `AppConfig` (`Locale`,
  `Messages`) so `useTranslations`/`Link`/etc. get real types instead of falling
  back to bare `string`.

**Moved** (git mv, content then edited in place):

- `apps/web/app/layout.tsx` → `app/[locale]/layout.tsx` — now the actual root
  layout (`<html>`/`<body>` live here per the guide), adds
  `generateStaticParams`, `NextIntlClientProvider`, locale-aware
  `generateMetadata` (replacing the single hardcoded metadata object).
- `apps/web/app/page.tsx`, `(dashboard)/**`, `(onboarding)/**`,
  `(storefront)/**` → same paths under `app/[locale]/`.

**Edited:**

- `packages/i18n/index.ts` — flat per-file named exports replaced with a
  `getMessages(locale)` merging all namespaces into the shape next-intl's
  `getRequestConfig` wants; `en/common.json`/`es/common.json` expanded from a
  `{"hello"}` stub to `loading`/`networkError`/`meta.title`/ `meta.description`.
- `apps/web/next.config.ts` — wrapped with
  `createNextIntlPlugin("./i18n/
  request.ts")`.
- `apps/web/lib/api.ts` — `apiFetch` takes an optional `fallbackErrorMessage`
  param instead of a hardcoded `"Error de red"`.
- Every dashboard/onboarding/storefront page/component — hardcoded strings
  replaced with `useTranslations(namespace)` (client) or
  `getTranslations(namespace)` (server); every hardcoded-path navigation
  (`window.location.href =`, `<a href>`, `router.push()` from `next/navigation`,
  server `redirect()`) replaced with the locale-aware equivalents from
  `apps/web/i18n/navigation.ts`.
- `apps/web/components/landing/*` — `language-toggle.tsx` rewritten to swap the
  locale segment via `usePathname()` + `Link` (with a `locale` prop) instead of
  a `localStorage` toggle; every section component swapped `useLanguage()` →
  `useTranslations("landing")`.
- `apps/web/__tests__/page.test.tsx` — import path updated to
  `../app/
  [locale]/page`, wrapped in `NextIntlClientProvider`,
  `next/navigation` mocked
  (`useRouter`/`usePathname`/`redirect`/`permanentRedirect`) since the render
  tree now pulls in next-intl's navigation helpers.
- `apps/web/vitest.config.ts` — added `test.server.deps.inline: ['next-intl']`.
  Without it, Vite pre-optimizes next-intl as an external dependency and its
  internal `next/navigation` import fails to resolve under pnpm's strict
  `node_modules` layout — inlining routes it through Vite's normal (mockable)
  transform pipeline instead.
- `docs/spec/i18n.md` — "Next.js: rendering strategy" rewritten to describe the
  adopted URL-prefix approach; original reasoning kept in a collapsed
  `<details>` for history. "Explicitly out of scope for MVP" swapped "URL-
  prefixed locale routing" for "Backend localization." "NestJS: backend
  localization" and "v1+" sections annotated with current status.

**Deleted:**

- `apps/web/components/landing/language-provider.tsx` — superseded by
  next-intl's request-scoped locale resolution.

## Verification

```
pnpm --filter @biasmarket/i18n build   # rebuilds dist/ with new namespaces
pnpm --filter web typecheck            # clean
pnpm --filter web test                 # 1/1 passing
```

Dev server (`pnpm dev`), checked via `curl` and a headless Playwright script:

- `/` with no `Accept-Language` → `307` to `/es` (+ `NEXT_LOCALE` cookie); with
  `Accept-Language: en-US,en;q=0.9` → `307` to `/en`.
- `/es`, `/en`, `/es/login` all `200`.
- Landing page screenshots (`/es`, `/en`, 1440×1000) confirm full translated
  copy, correct toggle label (shows the _target_ language).
- Scripted click on the toggle from `/es`: `href="/en"`, lands on `/en` with no
  console errors.

**Not verified end-to-end:** `/es/store/[slug]` returns `500` because `apps/api`
fails to boot (`ERR_PACKAGE_PATH_NOT_EXPORTED` on `@biasmarket/utils`) —
confirmed via `git diff --stat` to be pre-existing, uncommitted, unrelated
changes to `apps/api`/`packages/utils`, not caused by this work. Storefront
routing/translation itself (locale resolution, `getTranslations` call, not-found
copy) is code-reviewed but not exercised against live data — worth a follow-up
check once `apps/api` boots again.

Backend localization (`nestjs-i18n`, validation-message translation, email
templates) intentionally not built — tracked in `docs/spec/i18n.md` as a
separate follow-up.
