'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldError } from '@/components/ui/field-error';

export default function ChangePasswordPage() {
  const { updatePassword, account, signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự');
      return;
    }
    if (newPassword !== confirm) {
      setError('Xác nhận mật khẩu không khớp');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(currentPassword, newPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đổi mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-sm border border-border bg-surface p-8 shadow-sm">
        <h1 className="font-heading text-xl font-bold">Đổi mật khẩu bắt buộc</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tài khoản {account?.username ? `"${account.username}"` : ''} cần đặt mật khẩu mới trước khi
          tiếp tục. Chuẩn bị MFA sẽ được bật trong bản cập nhật sau.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Mật khẩu hiện tại</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type={show ? 'text' : 'password'}
                className="input-design h-10 pl-10"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Mật khẩu mới</label>
            <Input
              type={show ? 'text' : 'password'}
              className="input-design h-10"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Xác nhận mật khẩu mới</label>
            <Input
              type={show ? 'text' : 'password'}
              className="input-design h-10"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Hiện mật khẩu
          </label>
          {error && <FieldError message={error} />}
          <Button type="submit" variant="accent" className="h-10 w-full" disabled={loading}>
            {loading ? 'Đang lưu...' : 'Đổi mật khẩu'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full"
            onClick={() => void signOut()}
          >
            Đăng xuất
          </Button>
        </form>
      </div>
    </div>
  );
}
