# Wire landing page CTAs to real routes

## Context

Landing page (`apps/web/components/landing/*`) shipped with every CTA as an
inert `Button` — no `href`, no `onClick`. MVP flow already exists (`/onboarding`
signup → `/onboarding/create-store` → dashboard), so the ask was to point the
landing page at it instead of leaving dead buttons.

## Decisions

- **Every CTA points to `/onboarding`.** Copy varies ("Get early access", "I'll
  set up your first store for you", "Try it for your next drop") but there's
  only one signup flow in the MVP — no separate contact form or booking flow
  exists to justify different destinations.
- **`buttonVariants` + `Link`, not `Button` wrapping a link.** `Button` renders
  Base UI's `ButtonPrimitive` (a real `<button>`); rather than fight its
  composition API to render as an anchor, applied the same `cva` classes
  (`buttonVariants` from `@/components/ui/button`) directly to next-intl's
  `Link` — same look, correct element, locale prefix carried automatically.
- **Brand mark ("Bias Market" in the hero nav) now links home** (`/`) — small
  addition beyond the literal CTA ask, but a wordmark that isn't a link reads as
  a bug on any real landing page.

## What changed

**Edited:**

- `apps/web/components/landing/hero.tsx` — brand span → `Link href="/"`; both
  hero CTAs → `Link href="/onboarding"` styled via `buttonVariants`.
- `apps/web/components/landing/cta.tsx` — both CTAs → `Link href="/onboarding"`.
- `apps/web/components/landing/final-hook.tsx` — CTA →
  `Link href="/onboarding"`.

All three now import `buttonVariants` instead of `Button`, and `Link` from
`@/i18n/navigation` (not `next/link`) so the current locale prefix is preserved.

## Verification

`pnpm --filter web typecheck` — clean.

Dev server + headless Playwright on `/es`: dumped every `<a>` on the page —
brand → `/es`, all 5 CTAs → `/es/onboarding`. Clicked the primary CTA, landed on
`/es/onboarding`, zero console errors.
