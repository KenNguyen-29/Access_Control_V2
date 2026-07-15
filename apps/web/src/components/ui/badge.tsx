import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export function Badge({
  className,
  variant = 'secondary',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        variant === 'default' && 'border-transparent bg-primary text-white',
        variant === 'secondary' && 'border-transparent bg-secondary text-foreground',
        variant === 'destructive' && 'border-transparent bg-destructive text-destructive-foreground',
        variant === 'outline' && 'border-border text-foreground',
        className,
      )}
      {...props}
    />
  );
}
