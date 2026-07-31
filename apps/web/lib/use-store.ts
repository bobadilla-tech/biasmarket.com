/**
 * Compatibility re-export — the real implementation lives in
 * `@/features/stores` (TanStack Query, no more hand-rolled cache or
 * `CustomEvent` broadcast). Kept here so the many existing dashboard pages
 * that import `useStore`/`DashboardStore` from this path don't all need
 * touching in the same change; new code should import from
 * `@/features/stores` directly.
 */
export { useDashboardStore as useStore, type DashboardStore } from "@/features/stores";
