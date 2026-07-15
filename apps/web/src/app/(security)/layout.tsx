'use client';

import { AppShell } from '@/components/layout/AppShell';

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return <AppShell fullBleed>{children}</AppShell>;
}
