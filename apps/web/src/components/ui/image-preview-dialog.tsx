'use client';

import { Dialog } from '@/components/ui/dialog';

export function ImagePreviewDialog({
  open,
  src,
  title,
  onClose,
}: {
  open: boolean;
  src: string | null;
  title?: string;
  onClose: () => void;
}) {
  if (!src) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title || 'Ảnh chấm công'}
      description="Ảnh chụp lúc quét"
      className="max-w-4xl"
    >
      <div className="overflow-hidden rounded-sm border border-border bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={title || 'Snapshot'}
          className="mx-auto max-h-[75vh] w-auto max-w-full object-contain"
        />
      </div>
    </Dialog>
  );
}
