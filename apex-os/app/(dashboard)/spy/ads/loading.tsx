import { AdsGridSkeleton } from "@/components/spy/AdsWorkspace";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="h-28 animate-pulse rounded-lg border bg-card" />
      <AdsGridSkeleton />
    </div>
  );
}
