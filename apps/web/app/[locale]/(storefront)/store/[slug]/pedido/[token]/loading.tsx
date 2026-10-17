import { Skeleton } from "@/components/ui/skeleton";

// Fixed dimensions so the page does not shift when the order arrives.
export default function Loading() {
  return (
    <main
      className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-16 pt-24 sm:pt-24"
      role="status"
      aria-busy="true"
    >
      <Skeleton className="h-12 w-full rounded-2xl" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </main>
  );
}
