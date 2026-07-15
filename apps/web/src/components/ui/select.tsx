import { cn } from '@/lib/utils';

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        // Native <select> clips when input-design py-2.5 meets a short h-* override.
        'input-design h-10 py-0 leading-normal',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
