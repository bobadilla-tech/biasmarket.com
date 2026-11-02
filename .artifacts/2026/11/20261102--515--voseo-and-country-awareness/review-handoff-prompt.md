# Review handoff: #515 voseo / country stack

Use the `pr-review` skill. Review notes and draft comments go into `.artifacts/`
first; verify every claim by running code; run subagent review rounds until
clean; wait for human approval before posting anything with `gh`.

PRs (the implementer fills these in at the end of their session):

- 1a: #___ 1b: #___ 2: #___ 3: #___ 4a: #___ 4a-2: #___ 4b: #___ 5: #___ 5b:
  #___ 6a: #___ 6b: #___

Plan: `.artifacts/2026/11/20261102--515--voseo-and-country-awareness/plan.md`
Review log:
`.artifacts/2026/11/20261102--515--voseo-and-country-awareness/review-log.md`

Review each stacked PR against its own base first, then re-check the stack top.
CI results exist for stacked PRs too (`ci.yml:8`).

Checklist (plan section 9):

1. Zero voseo in `packages/i18n/es/**`, `packages/utils/src/whatsapp/**` and API
   strings with the unicode regex; guard fails on seeded voseo; fixtures cover
   accented forms.
2. Overlay keys exist in `es`, placeholders match;
   `getMessages`/`getMobileMessages` accept register; `en` untouched.
3. `resolveRegister` matrix and precedence cookie > CF header > null (account
   country seeds the cookie).
4. Store setting: ownership check, 403 for non-owner, `storeId`-scoped.
5. Auth fields: zod validation on signup AND updateUser; `role`/`plan` still not
   settable.
6. Country dropdown full list, flags, hydration safe; server rejects invalid
   codes.
7. Caddy: strip only for non-CF sources, placed before the blue/green import;
   log redaction; forged-header curl evidence; Q8 evidence pasted in the PR.
8. Product flag (PR 5) and badge (PR 5b): new products explicit false from the
   form, existing rows true via migration DEFAULT true; badge advisory; no
   checkout block.
9. Migrations additive, sort after `20261030010000`, old-release INSERT ok, SDK
   drift green.
10. No country-dependent output in static/cacheable pages; no raw IP stored.

11. Plan section 9 items 11-14b (PR 6a/6b): unknown -> tuteo; store setting
    wins; buyer country only from account or phone dial code, never a client
    header; custom templates untouched; Caddy recreate evidence for PR 3.

Also check: `POST /api/country` Origin/CSRF tests; shared Sentry scrub tests;
the named tenant-isolation tests in plan section 7; mobile bundle still builds
after PR 2.

Known risks to probe: better-auth `validator.input` on `updateUser`, Caddy
directive order with `import`, dashboard server `getTranslations` usage,
`BuyerAccount.countryCode` leaking to seller payloads, CI wiring for the new
`packages/i18n` test script.
