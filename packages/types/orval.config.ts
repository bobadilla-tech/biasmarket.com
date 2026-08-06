import { defineConfig } from "orval";

export default defineConfig({
  api: {
    input: {
      target: "../../apps/api/openapi.json",
      // The two CustomerAuth endpoints that were missing their `slug` path
      // parameter (see git history / the Batch 5 plan doc for the full story)
      // got a real `@ApiParam({ name: "slug" })` fix — `unsafeDisableValidation`
      // is no longer needed and was removed; Orval's validator now passes on
      // the whole spec. If a future module reintroduces a similar spec gap,
      // re-add this flag with a comment naming the specific gap, not as a
      // standing bypass.
      // Scoped to controllers that actually have real response DTOs today —
      // `Collections` and `Products` (see the plan doc's Phase 1/rollout
      // Batch 1). Every other controller still returns untyped Prisma
      // results with no `@ApiOkResponse` shape, so `@nestjs/swagger` emits
      // an anonymous inline `{ [key: string]: unknown }` placeholder per
      // operation; Orval names those placeholders after the
      // (post-`operationName`-override) shortened method name, e.g.
      // `FindAll200Item`. Every controller's `findAll` collided into the
      // same identifier in the shared `api.schemas.ts` once more than one
      // tag was generated — a real problem, but only for modules that don't
      // have real response DTOs yet. Add a tag here as each future module
      // gets real response DTOs (rollout doc's Batch 2+); don't add one
      // just because a tag exists in the spec.
      filters: {
        mode: "include",
        tags: [
          "Collections",
          "Products",
          "Categories",
          "Notifications",
          "Contact",
          "Suggestions",
          "StoreSections",
          "DeliveryConfig",
          "PublicDeliveryConfig",
          "PaymentConfig",
          "PublicPaymentConfig",
          "PickupPoints",
          "PublicPickupPoints",
          "Stores",
          "MyStores",
          "Order",
          "Checkout",
          "CustomerAuth",
          "CustomerAccount",
          "Customers",
          "ProductSearch",
          "Stats",
          "Users",
        ],
      },
    },
    output: {
      target: "./generated/api.ts",
      client: "fetch",
      mode: "tags-split",
      clean: true,
      override: {
        // Default operation names are the full NestJS operationId
        // (`CollectionsController_findAll`) — every controller in
        // apps/api's already-free tag-per-controller grouping (see the
        // follow-up plan doc) uses this `<Controller>_<method>` shape, so
        // stripping the prefix once, here, gives every tag's generated
        // object clean method names (`collections.findAll(...)`) with zero
        // per-tag configuration as new modules migrate.
        operationName: (operation) => {
          const parts = String(operation.operationId).split("_");
          const name = parts[1] ?? parts[0];
          // "delete" is a reserved word — Orval falls back to "_delete",
          // which typechecks fine but reads worse than every other method
          // name here. "remove" avoids the collision without a special case
          // per module (`ControllerName_delete` is a common NestJS pattern).
          const methodName = name === "delete" ? "remove" : name;
          // Returning [methodName, typeName]: the first element names the
          // generated function (kept short/clean per tag, as above); the
          // second names Orval's internally-derived types (e.g. a
          // query-param'd `findAll`'s `FindAllParams`) — those land in the
          // single shared api.schemas.ts unnamespaced by tag, so two
          // different controllers both naming a method "findAll" collide
          // there (`TS2300: Duplicate identifier`) even though their
          // generated functions live in separate per-tag files and never
          // collide themselves. Using the full, already-unique
          // operationId for the type-name half avoids this — see
          // apps/web/AGENTS.md's Orval config notes (hit for real between
          // Notifications and PaymentConfig's findAll, Batch 3).
          return [methodName, String(operation.operationId)];
        },
        mutator: {
          path: "./http.ts",
          name: "customFetch",
        },
        fetch: {
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
});
