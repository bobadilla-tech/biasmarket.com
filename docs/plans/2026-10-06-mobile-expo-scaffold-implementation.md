# Mobile Expo scaffold implementation record

## Starting state

- Started from a clean `main` checkout and created `feat/mobile-expo-scaffold`.
- `pnpm-workspace.yaml` already includes `apps/*`; no workspace glob change was needed.
- The user authorized `git clean -fd` before implementation. Ignored files were kept.
- The requested GitHub follow-up issue for duplicate brand color tokens could not be created: the connected integration returned HTTP 403, and the local `gh` token was invalid.

## Changes

1. Added `apps/mobile` from the Expo Router TypeScript template and removed its feature/demo routes.
2. Configured Expo Router and NativeWind. Tailwind reads spacing, radii, and typography from `@biasmarket/design-tokens/source`; the mobile-only brand palette is temporary pending a follow-up unification issue. `react-native-css-interop` is an explicit dependency because NativeWind's JSX transform imports its runtime directly and pnpm's isolated layout does not expose transitive dependencies to app source.
3. Added `@biasmarket/{design-tokens,query,types,utils,validation}` as `workspace:*` dependencies.
4. Added mobile lint/typecheck scripts and explicit persistent, uncached `mobile#dev` Turbo wiring. Dev does not build workspace dependencies first.
5. Added mobile path detection, a lint/typecheck CI job, and the mobile check to the required CI-success gate.
6. Kept one placeholder route that renders “Hello, Bias Market.”

## Verification

- `pnpm turbo run lint typecheck --filter=mobile` — passed.
- `pnpm typecheck` — passed across 20 Turbo tasks.
- `pnpm lint` — passed across the monorepo; web/API changed-file formatting reported zero changes.
- `pnpm exec prettier --check` on changed source/config files — passed.
- Tailwind CLI compiled `src/global.css` using the mobile Tailwind config and token source.
- `pnpm --filter mobile exec expo config --type public` — passed.
- `pnpm --filter mobile exec expo export --platform android --output-dir /tmp/mobile-bundle-check` — passed; Android bundle contains 1,583 modules.
- Started `pnpm turbo run dev --filter=mobile`; Metro announced `exp://192.168.18.131:8081` and Expo Go QR output. The user will verify launch on an Android phone. No simulator was started.
- Simulated the CI-success script with mobile marked changed/successful and unrelated jobs skipped — passed.

## Remaining proof and deviations

- Physical Android launch remains for the user to verify. iOS Simulator proof is deferred; the available machine had no active Xcode installation.
- A hosted GitHub Actions run cannot be claimed from local checks. The CI filter/job/gate wiring is present and the lockfile supports frozen installs.
- The canonical web/mobile brand color source remains a follow-up, as requested. The issue creation attempt was blocked by connector permissions.
- Expo dependency compatibility check ran in offline mode and reported local dependency-map results, so it is weaker than a live registry validation.
