// Unit-test stand-in for `@biasmarket/db`.
//
// The real package re-exports Prisma ORM v7's generated client, which is
// ESM-only (it uses `import.meta.url` internally) and can't be loaded by
// ts-jest's CommonJS transform. Unit tests never talk to a real database —
// they inject a fake `PrismaService` via `useValue` — so `PrismaService`
// only needs *some* class to `extend`.
export class PrismaClient {}
