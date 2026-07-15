'use client';

import { useState } from 'react';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [exiting, setExiting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      setExiting(true);
      await signIn(username, password);
    } catch (err) {
      setExiting(false);
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  if (exiting) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-neutral transition-all duration-500">
        <div className="relative mb-8">
          <div className="h-20 w-20 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <div className="absolute inset-0 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Access Control" className="h-auto w-14 object-contain" />
          </div>
        </div>
        <p className="animate-pulse text-sm font-semibold tracking-widest text-foreground">
          Đang tải...
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-cover bg-center bg-no-repeat p-4 font-body"
      style={{ backgroundImage: "url('/Background.jpg')" }}
    >
      <div className="flex w-full max-w-4xl overflow-hidden rounded-sm shadow-sm">
        <div className="relative hidden w-[300px] flex-col items-center justify-center bg-primary p-10 text-foreground md:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo1.png" alt="Access Control" className="mb-6 h-auto w-32 object-contain" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo2.png" alt="TECHWAVE" className="mb-6 h-auto w-32 object-contain" />
          <h2 className="text-center font-heading text-2xl font-bold text-white">Access Control</h2>
          <p className="mt-2 text-center text-sm text-white/80">Smart Building Platform</p>
        </div>

        <div className="flex flex-1 flex-col justify-center bg-surface p-10 md:p-14">
          <div className="mx-auto w-full max-w-sm">
            <span className="text-label-caps uppercase tracking-[0.2em] text-foreground">
              Đăng nhập
            </span>
            <h1 className="mb-8 mt-2 font-heading text-2xl font-bold text-foreground">
              Hệ thống kiểm soát ra vào
            </h1>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tên đăng nhập"
                  className="input-design h-11 pl-11"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mật khẩu"
                  className="input-design h-11 pl-11 pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" variant="accent" className="h-11 w-full" disabled={loading}>
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
