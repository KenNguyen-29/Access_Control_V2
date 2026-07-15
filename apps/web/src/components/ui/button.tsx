import { cn } from '@/lib/utils';

export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'accent' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'icon';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-sm text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
        size === 'default' && 'px-4 py-2',
        size === 'sm' && 'h-9 px-3 text-xs',
        size === 'icon' && 'h-8 w-8 p-0',
        variant === 'default' && 'bg-secondary text-foreground hover:bg-secondary/80',
        variant === 'accent' && 'bg-secondary text-foreground hover:bg-secondary/80',
        variant === 'outline' &&
          'border border-tertiary/20 bg-transparent text-foreground hover:bg-tertiary/5',
        variant === 'ghost' && 'hover:bg-tertiary/5',
        variant === 'destructive' &&
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        className,
      )}
      {...props}
    />
  );
}
