import { LoadingState } from "@/components/shared/loading-state";

export default function Loading() {
  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <LoadingState variant="page" />
      </div>
    </div>
  );
}
