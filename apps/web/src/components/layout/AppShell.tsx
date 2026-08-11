'use client';

import { AppNav } from '@/components/layout/AppNav';
import { RequirePermission } from '@/components/layout/RequirePermission';

export function AppShell({
  children,
  fullBleed = false,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
}) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-neutral font-body antialiased">
      <AppNav />
      <main className="relative flex flex-1 flex-col overflow-hidden pt-16">
        <div
          className={
            fullBleed
              ? 'relative min-h-0 flex-1 overflow-hidden bg-neutral'
              : 'relative min-h-0 flex-1 overflow-y-auto bg-neutral'
          }
        >
          <RequirePermission>{children}</RequirePermission>
        </div>
      </main>
    </div>
  );
}
