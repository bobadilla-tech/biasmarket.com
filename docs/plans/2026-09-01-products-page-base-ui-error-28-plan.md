# Products dashboard crash — Base UI error #28

Written **before execution**, at the user's explicit request (deviates from
this directory's usual "record after the work lands" convention — see
`docs/plans/README.md`).

## Context

Reported crash on `https://biasmarket.com/es/dashboard/tienditaunica/products`:

```
Error: Base UI error #28; visit https://base-ui.com/production-error?code=28
```

with the app's error boundary showing "Algo salió mal". A second, unrelated
console line (`Cannot read properties of undefined (reading 'startTime')` in
a `reportAllChanges` web-vitals shim) is browser/extension noise, not part of
this bug — no matching code in this repo, ignored.

## Audit

**Decoding the error code.** `base-ui.com/production-error` only serves a
template page (no code→message table). The mapping lives in the shipped
package instead — `@base-ui/react`'s dev branch keeps the literal message
next to the prod code:

```
apps/web/node_modules/.../internals/field-root-context/FieldRootContext.mjs:52
throw new Error(process.env.NODE_ENV !== "production"
  ? 'Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>.'
  : _formatErrorMessage(28));
```

Code 28 = a `Field.*` subcomponent rendered outside a `<Field.Root>`.
`useFieldRootContext(false)` (the `false` = "not optional") throws when no
provider is found — `Field.Label`, `Field.Control` (`select/label`,
`combobox/*`, etc.) all call it this way.

**Finding the offending component.** `apps/web/components/ui/label.tsx`
wraps Base UI's `Field.Label`, not a plain `<label>`:

```tsx
import { Field as FieldPrimitive } from "@base-ui/react/field";
function Label({ className, ...props }: FieldPrimitive.Label.Props) {
  return <FieldPrimitive.Label data-slot="label" ... {...props} />;
}
```

Every other consumer in the repo wraps it in `<Field.Root>`:

- `features/auth/components/login-form.tsx` — `Field.Control` inside
  (implicit) `Field.Root` usage
- `features/store-settings/components/section-primitives.tsx:73-81` —
  `<A11yField.Root><A11yField.Label>...`
- `components/shared/form-a11y.tsx`'s shared `FormField` helper — built
  exactly for this: `<Field.Root invalid={...}><Field.Label htmlFor={id}>`

`grep -rl "<Label" apps/web/features apps/web/app apps/web/components` finds
**exactly one** consumer that doesn't go through `Field.Root`:
`apps/web/features/products/components/product-sheet.tsx` — 6 call sites
(`:388`, `:413`, `:429`, `:463`, `:485`, `:515`, name/description/price/
currency/availability/stock fields), each a bare `<Label htmlFor="...">`
next to a plain `Input`/`Textarea`/`Select` wired with `react-hook-form`'s
`register()`, no `Field.Root` anywhere in the file.

`git log` traces `label.tsx`/`field.tsx` to `35162bc` ("a11y phase 1 shared
primitives"); `product-sheet.tsx` was touched by the later phase-3/7/8 a11y
commits (`b39263a`, `aee759c`, `2beae5f`) that adopted the shared
`FormErrorSummary` from `form-a11y.tsx` but swapped bare inputs' native
`<label>` for the new `Field.Label`-backed `Label` without also picking up
`Field.Root` — the gap this bug is.

**Confirming isolation.** `Input` (`components/ui/input.tsx`, wraps
`@base-ui/react/input`) and the native-`<select>`-based `Select` do **not**
call `useFieldRootContext` — verified by grepping the installed
`@base-ui/react` source. Only `Field.Label` needs the provider, so nothing
else in `product-sheet.tsx` is at risk once `Label` is fixed. No other
`apps/web` file was found using `<Label>` outside a `Field.Root`.

**Server-side check.** SSH'd to the VPS (`ubuntu@150.136.181.240`), grepped
`docker logs biasmarket-web-blue-1` for the last 24h — no server-side trace,
as expected: this throws during client-side render of a `"use client"` sheet,
never reaches Next's server logs. No Sentry/error-tracking wired up in
`apps/web` currently, so this crash was only visible via the reporter's own
browser console. Confirms the bug is real and live (`web-blue` has been up
13h, i.e. it's the current deployed image), not a stale report.

## Fix

Wrap each of the 6 field groups in `product-sheet.tsx` with `Field.Root`
(already exported from `@/components/ui/field`), matching the pattern every
other consumer already uses. `Field.Root` only provides context — it doesn't
require `Field.Control`, so the existing plain `Input`/`Textarea`/`Select` +
manual `htmlFor`/`id`/`aria-*` wiring stays untouched; this is a
context-provider wrapper only, not a rewrite onto the `FormField` helper
(that would also mean re-deriving each field's custom Tailwind classes
through `FormField`'s render-prop shape — out of scope for a crash fix).

Not fixing by rewriting `components/ui/label.tsx` back to a plain `<label>`:
that would silently drop `Field.Label`'s a11y wiring for the 3 files that
correctly depend on it today (`login-form.tsx`, `section-primitives.tsx`,
`form-a11y.tsx`) — the shared component is right, `product-sheet.tsx` is the
outlier.

## Validation

Applied: wrapped all 6 field groups in `Field.Root`, added the import. Ran
`pnpm --filter web typecheck` (clean for this file — the 2 remaining repo
errors are pre-existing, in `landing/components/{blog,categories}-section.tsx`,
unrelated `common.carousel` i18n-namespace gap from the #166 work) and
`npx eslint features/products/components/product-sheet.tsx` (clean).

Not yet done: manual browser verification (`pnpm --filter web dev`, open the
products dashboard, add/edit a product). No test currently covers
`product-sheet.tsx` rendering; not adding one for this fix (single-file,
visually-verifiable JSX wrapper change) unless asked.

## Deploy

Not triggering myself — production only deploys via the blue/green CI/CD flow
(`docs/core/deploy.md`); this fix lands as a normal PR to `main`.
