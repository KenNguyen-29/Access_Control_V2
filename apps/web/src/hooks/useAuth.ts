'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { login } from '@/lib/api';

type Account = { id: string; username: string; role: string };

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
    setLoading(false);
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const result = await login(username, password);
      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('account', JSON.stringify(result.account));
      setAccount(result.account);
      setIsAuthenticated(true);
      router.push('/home');
    },
    [router],
  );

  const signOut = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('account');
    setAccount(null);
    setIsAuthenticated(false);
    router.push('/login');
  }, [router]);

  return { isAuthenticated, loading, account, signIn, signOut };
}
