import { cn } from '@/lib/utils';

export function Avatar({
  name,
  src,
  className,
}: {
  name?: string | null;
  src?: string | null;
  className?: string;
}) {
  const initial = (name?.trim()?.[0] || '?').toUpperCase();
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted',
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? ''} className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">{initial}</span>
      )}
    </div>
  );
}
