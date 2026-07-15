import { cn } from '@/lib/utils';

export function PageShell({
  title,
  subtitle,
  badge,
  actions,
  children,
  className,
  fitContent = false,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  fitContent?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col bg-neutral font-body text-foreground',
        fitContent ? 'h-auto overflow-visible' : 'h-full overflow-y-auto',
        className,
      )}
    >
      <div className="shrink-0 border-b border-border bg-surface px-6 pb-4 pt-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {badge && (
              <span className="mb-2 inline-block text-label-caps uppercase tracking-[0.2em] text-foreground">
                {badge}
              </span>
            )}
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      <div className={cn('p-6 lg:p-8', !fitContent && 'flex-1')}>
        <div className="mx-auto max-w-7xl space-y-6">{children}</div>
      </div>
    </div>
  );
}

export function DesignCard({
  children,
  className,
  title,
  description,
  actions,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn('card-design', className)}>
      {(title || description || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="font-heading font-bold text-foreground">{title}</h3>}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
