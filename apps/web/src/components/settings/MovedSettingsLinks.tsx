'use client';

import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { SettingsLinkGrid } from '@/components/settings/SettingsLinkGrid';
import {
  getMovedSectionLinks,
  type SettingsLinkItem,
} from '@/lib/settingsCatalog';

interface MovedSettingsLinksProps {
  sectionId: 'hr' | 'access' | 'shifts';
  /** Ẩn link trùng màn hiện tại (vd. /users trên trang Nhân sự). */
  excludePath?: string;
  title?: string;
  description?: string;
  items?: SettingsLinkItem[];
  /** Nhãn nút; mặc định "Liên kết". */
  buttonLabel?: string;
}

export function MovedSettingsLinks({
  sectionId,
  excludePath,
  title = 'Liên kết nhanh',
  description,
  items: itemsProp,
  buttonLabel = 'Liên kết',
}: MovedSettingsLinksProps) {
  const [open, setOpen] = useState(false);
  const items = itemsProp ?? getMovedSectionLinks(sectionId, excludePath);
  if (items.length === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" type="button" onClick={() => setOpen(true)}>
        <Link2 className="h-4 w-4" />
        {buttonLabel}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        className="max-w-lg"
      >
        <SettingsLinkGrid items={items} />
      </Dialog>
    </>
  );
}
