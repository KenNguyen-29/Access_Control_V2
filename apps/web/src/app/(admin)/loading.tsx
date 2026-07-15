export default function AdminLoading() {
  return (
    <div className="flex h-full animate-pulse flex-col bg-neutral">
      <div className="shrink-0 border-b border-border bg-surface px-6 pb-4 pt-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-7 w-56 rounded bg-muted" />
            <div className="h-4 w-72 rounded bg-muted/70" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 rounded bg-muted" />
            <div className="h-9 w-28 rounded bg-muted" />
          </div>
        </div>
      </div>
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-sm border border-border bg-surface" />
            ))}
          </div>
          <div className="rounded-sm border border-border bg-surface p-6">
            <div className="mb-4 h-5 w-48 rounded bg-muted" />
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-muted/60" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
