'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { changePassword, getMe, login, logout as apiLogout } from '@/lib/api';

export type Account = {
  id: string;
  username: string;
  role: string;
  mustChangePassword?: boolean;
  mfaEnabled?: boolean;
  projectIds?: string[];
  allowedRoutes?: string[];
};

export function useAuth() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const raw = localStorage.getItem('account');
    setIsAuthenticated(!!token);
    if (raw) {
      try {
        setAccount(JSON.parse(raw) as Account);
      } catch {
        setAccount(null);
      }
    }
    if (token) {
      getMe()
        .then((me) => {
          localStorage.setItem('account', JSON.stringify(me));
          setAccount(me);
        })
        .catch(() => {
          /* keep cached account */
        });
    }
    setLoading(false);
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const result = await login(username, password);
      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('account', JSON.stringify(result.account));
      // Companion cookie so Next middleware can soft-guard routes
      document.cookie = `acv2_session=1; path=/; SameSite=Lax; max-age=${7 * 24 * 3600}`;
      setAccount(result.account);
      setIsAuthenticated(true);
      if (result.mustChangePassword || result.account.mustChangePassword) {
        router.push('/change-password');
        return;
      }
      router.push('/home');
    },
    [router],
  );

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* ignore */
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('account');
    document.cookie = 'acv2_session=; path=/; Max-Age=0';
    setAccount(null);
    setIsAuthenticated(false);
    router.push('/login');
  }, [router]);

  const updatePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await changePassword(currentPassword, newPassword);
      const raw = localStorage.getItem('account');
      if (raw) {
        const next = { ...(JSON.parse(raw) as Account), mustChangePassword: false };
        localStorage.setItem('account', JSON.stringify(next));
        setAccount(next);
      }
      router.push('/home');
    },
    [router],
  );

  return {
    isAuthenticated,
    loading,
    account,
    signIn,
    signOut,
    updatePassword,
  };
}
