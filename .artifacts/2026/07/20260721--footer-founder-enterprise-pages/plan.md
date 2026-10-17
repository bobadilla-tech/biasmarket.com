# Footer + Founders/Enterprise static pages

## Context

`apps/web` had no footer and no static/marketing pages beyond the single landing
page — nothing crediting Bobadilla Tech, no team page, no page for larger
sellers/agencies. Ask: add a site footer crediting Bobadilla Tech (linking to
bobadilla.tech), plus basic Founders and Enterprise static pages, with content
easy to edit later without touching component code.

Researched the sibling `../bobadilla.tech` repo for precedent — it already had a
`FounderPage` with real bio copy for Eliaz Bobadilla, reused as a starting
point. Bias Market's repo already has an established mechanism for "easy to
edit" content: `packages/i18n/{en,es}/*.json`, namespaced by feature, consumed
via `next-intl` — no need to invent a CMS.

## Decisions

- **New `marketing` i18n namespace** (`packages/i18n/{en,es}/marketing.json`,
  wired into `packages/i18n/index.ts`), holding `footer`, `founderPage`, and
  `enterprisePage` keys — mirrors the existing per-feature namespacing
  (`landing`, `dashboard`, etc.). All page copy lives here; editing the
  founders' names/bios or CTA copy never touches a `.tsx` file.
- **One small non-localized constants file**, `apps/web/lib/site-config.ts`
  (`BOBADILLA_TECH_URL`, `CONTACT_EMAIL`) — the one fact that isn't translatable
  prose, kept separate from the i18n JSON.
- **Footer renders on marketing pages only** (landing, `/founder`,
  `/enterprise`), not added to the root `[locale]/layout.tsx`. Dashboard,
  onboarding, and storefront are app surfaces, not marketing pages, and they
  don't opt into the `landing-theme` brand palette — adding it there would clash
  visually and was out of scope.
- **Founders page became a 3-person team page, not a solo bio**, after follow-up
  feedback: Carlos Bonifacio (Founding Engineer), Eliaz Bobadilla (Tech Lead),
  Alexandra Flores (Distribution & Marketing). Content is a `team` array in i18n
  (`{name, role, bio}`) rendered as a card grid — adding a fourth founder later
  is a JSON edit, not a component change.
- **`getTranslations` namespace can't nest 3 levels deep** — `next-intl`'s typed
  `NamespaceKeys` rejected `"marketing.founderPage.meta"` (TS error, suggested
  the 2-level `"marketing.founderPage"` instead). Fixed by resolving the
  namespace one level shallower and reading `t("meta.title")` /
  `t("meta.description")` as nested keys instead of a namespace segment — same
  pattern already used for `common.meta` in the root layout.
- **Enterprise page CTA and Founders CTA both use `mailto:` via
  `CONTACT_EMAIL`**, not `/onboarding` — the copy explicitly asks the visitor to
  "get in touch"/"contact us", so routing to the self-serve signup flow would
  contradict the CTA text.

## What changed

**New:**

- `packages/i18n/en/marketing.json`, `packages/i18n/es/marketing.json`
- `apps/web/lib/site-config.ts`
- `apps/web/components/marketing/footer.tsx`
- `apps/web/components/marketing/founder-page.tsx`
- `apps/web/components/marketing/enterprise-page.tsx`
- `apps/web/app/[locale]/founder/page.tsx`
- `apps/web/app/[locale]/enterprise/page.tsx`

**Edited:**

- `packages/i18n/index.ts` — import + wire the `marketing` namespace into both
  locale objects.
- `apps/web/components/landing/landing-page.tsx` — render `<Footer />` after
  `<FinalHook />`.

Both new pages wrap content in the `landing-theme` class so they match the
homepage's brand palette (per the existing scoping comment in
`app/globals.css`), and each exports its own `generateMetadata` reading from its
own namespace instead of inheriting the root layout's generic `common.meta`
title/description.

## Verification

- `pnpm turbo run typecheck --filter=web --filter=@biasmarket/i18n` — clean.
  (Root `pnpm typecheck` currently fails on `@biasmarket/db#build` due to a
  missing `DATABASE_URL` for `prisma generate` — pre-existing, unrelated to this
  change.)
- No `lint` script exists for `web` yet, so nothing to run there.
- Dev server (`pnpm --filter web dev`), curled `/en`, `/en/founder`,
  `/en/enterprise`, `/es/founder`, `/es/enterprise` — all 200. Grepped rendered
  HTML for the Bobadilla Tech credit link, all three founders' names/roles on
  both locales, and the enterprise feature copy — all present.
