import { cn } from '@/lib/utils';

/** Inline field error under form inputs. */
export function FieldError({ message, className }: { message?: string; className?: string }) {
  if (!message) return null;
  return <p className={cn('mt-1 text-xs text-destructive', className)}>{message}</p>;
}

export function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}
