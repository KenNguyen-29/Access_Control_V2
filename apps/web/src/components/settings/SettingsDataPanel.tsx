'use client';

import { Download } from 'lucide-react';
import { DesignCard } from '@/components/design/PageShell';
import { SettingsLinkGrid } from '@/components/settings/SettingsLinkGrid';
import type { SettingsLinkItem } from '@/lib/settingsCatalog';

interface SettingsDataPanelProps {
  linkItems: SettingsLinkItem[];
}

export function SettingsDataPanel({ linkItems }: SettingsDataPanelProps) {
  return (
    <div className="space-y-6">
      <SettingsLinkGrid items={linkItems} />

      <DesignCard
        title="Xuất dữ liệu"
        description="Xuất báo cáo chấm công và access log từ trang Báo cáo. Cấu hình lưu trữ dùng link Lưu trữ phía trên."
      >
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <Download className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Để xuất CSV / Excel, mở mục <strong className="text-foreground">Báo cáo</strong>. Thời
            gian giữ log, snapshot và lịch sử chấm công chỉnh tại{' '}
            <strong className="text-foreground">Lưu trữ</strong>.
          </p>
        </div>
      </DesignCard>
    </div>
  );
}
