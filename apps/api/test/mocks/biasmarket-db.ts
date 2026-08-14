// Unit-test stand-in for `@biasmarket/db`.
//
// The real package re-exports Prisma ORM v7's generated client, which is
// ESM-only (it uses `import.meta.url` internally) and can't be loaded by
// ts-jest's CommonJS transform. Unit tests never talk to a real database —
// they inject a fake `PrismaService` via `useValue` — so `PrismaService`
// only needs *some* class to `extend`.
export class PrismaClient {}

// `Prisma.Decimal` is re-exported here too — imported by relative path
// (not the `@biasmarket/db` bare specifier, which this file itself stands
// in for) straight from the real generated client. Unlike `PrismaClient`,
// it's a plain class with no engine/connection behind it, so loading it
// doesn't need a `DATABASE_URL` or hit the ESM-loader issue above; unit
// tests doing real Decimal arithmetic (see `payment-summary.ts`) need the
// genuine decimal.js-backed implementation, not a fake.
export { Prisma } from '../../../../packages/db/index.ts';
