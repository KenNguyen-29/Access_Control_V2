export default function AccessControlLoading() {
  return (
    <div className="flex h-full animate-pulse flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-card px-6 pb-4 pt-6 lg:px-8">
        <div className="mb-2 h-3 w-20 rounded bg-muted" />
        <div className="h-8 w-64 rounded bg-muted" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-muted/70" />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden w-56 shrink-0 border-r border-border bg-card p-4 md:block">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 rounded bg-muted/60" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-muted/50" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
