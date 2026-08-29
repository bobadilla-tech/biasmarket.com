import { LoadingState } from "@/components/shared/loading-state";

export default function Loading() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-dvh px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <LoadingState variant="page" />
      </div>
    </main>
  );
}
