'use client';

import { DesignCard } from '@/components/design/PageShell';
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
}

export function MovedSettingsLinks({
  sectionId,
  excludePath,
  title = 'Liên kết nhanh',
  description,
  items: itemsProp,
}: MovedSettingsLinksProps) {
  const items = itemsProp ?? getMovedSectionLinks(sectionId, excludePath);
  if (items.length === 0) return null;

  return (
    <DesignCard title={title} description={description}>
      <SettingsLinkGrid items={items} />
    </DesignCard>
  );
}
