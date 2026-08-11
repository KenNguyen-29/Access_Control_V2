'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { normalizePath } from '@/lib/permissions';

export function RequirePermission({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, canAccess } = usePermissions();
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!role) return;
    const path = normalizePath(pathname);
    if (!canAccess(path)) {
      setDenied(true);
      router.replace('/home?denied=1');
    } else {
      setDenied(false);
    }
  }, [role, pathname, canAccess, router]);

  if (!role) return null;
  if (denied) return null;

  return <>{children}</>;
}
