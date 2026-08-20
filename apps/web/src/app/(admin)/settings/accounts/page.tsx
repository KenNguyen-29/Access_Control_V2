'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TablePager } from '@/components/ui/table-pager';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { RequiredMark } from '@/components/ui/field-error';
import { DesignCard, PageShell } from '@/components/design/PageShell';
import { QueryBoundary } from '@/components/ui/query-states';
import {
  ApiError,
  createAccount,
  deleteAccount,
  getAccounts,
  getProjects,
  getRoles,
  updateAccount,
  type SystemAccount,
} from '@/lib/api';
import { defaultAllowedRoutesForRole, rolesRequiringProjects, CONFIGURABLE_ROUTES } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  username: '',
  password: '',
  roleId: '',
  projectIds: [] as string[],
  allowedRoutes: ['/home'] as string[],
  isActive: true,
  mustChangePassword: true,
};

export default function AccountsSettingsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SystemAccount | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<SystemAccount | null>(null);

  const accountsQuery = useQuery({
    queryKey: ['accounts', page, search],
    queryFn: () =>
      getAccounts({
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
      }),
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => getRoles(),
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', 'accounts-form'],
    queryFn: () => getProjects(),
    enabled: open,
  });

  const roles = rolesQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const items = accountsQuery.data?.items ?? [];
  const total = accountsQuery.data?.total ?? 0;
  const totalPages = accountsQuery.data?.totalPages ?? 1;

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === form.roleId) ?? null,
    [roles, form.roleId],
  );
  const needsProjects = selectedRole ? rolesRequiringProjects(selectedRole.code) : false;
  const isAdminRole = selectedRole?.code === 'ADMIN';

  useEffect(() => {
    setPage(1);
  }, [search]);

  function openCreate() {
    const defaultRole = roles[0];
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      roleId: defaultRole?.id ?? '',
      allowedRoutes: defaultAllowedRoutesForRole(defaultRole?.code ?? 'STAFF'),
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(row: SystemAccount) {
    setEditing(row);
    setForm({
      username: row.username,
      password: '',
      roleId: row.role.id,
      projectIds: [...row.projectIds],
      allowedRoutes: [...(row.allowedRoutes ?? defaultAllowedRoutesForRole(row.role.code))],
      isActive: row.isActive,
      mustChangePassword: row.mustChangePassword,
    });
    setError(null);
    setOpen(true);
  }

  function onRoleChange(roleId: string) {
    const next = roles.find((r) => r.id === roleId);
    setForm((f) => ({
      ...f,
      roleId,
      allowedRoutes: defaultAllowedRoutesForRole(next?.code ?? 'STAFF'),
    }));
  }

  function toggleRoute(prefix: string) {
    if (prefix === '/home') return;
    setForm((prev) => {
      const next = prev.allowedRoutes.includes(prefix)
        ? prev.allowedRoutes.filter((p) => p !== prefix)
        : [...prev.allowedRoutes, prefix];
      return {
        ...prev,
        allowedRoutes: next.includes('/home') ? next : ['/home', ...next],
      };
    });
  }

  function toggleProject(projectId: string) {
    setForm((prev) => ({
      ...prev,
      projectIds: prev.projectIds.includes(projectId)
        ? prev.projectIds.filter((id) => id !== projectId)
        : [...prev.projectIds, projectId],
    }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing && !form.password.trim()) {
        throw new ApiError('Mật khẩu bắt buộc khi tạo tài khoản', 400);
      }
      if (needsProjects && form.projectIds.length === 0) {
        throw new ApiError('Vai trò này bắt buộc gán ít nhất một dự án', 400);
      }
      if (editing) {
        return updateAccount(editing.id, {
          roleId: form.roleId,
          projectIds: form.projectIds,
          allowedRoutes: form.allowedRoutes,
          isActive: form.isActive,
          mustChangePassword: form.mustChangePassword,
          ...(form.password.trim() ? { password: form.password.trim() } : {}),
        });
      }
      return createAccount({
        username: form.username.trim(),
        password: form.password.trim(),
        roleId: form.roleId,
        projectIds: form.projectIds,
        allowedRoutes: form.allowedRoutes,
        isActive: form.isActive,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setOpen(false);
      setError(null);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Lưu thất bại');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (row: SystemAccount) => deleteAccount(row.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setDeleteTarget(null);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Xóa thất bại');
    },
  });

  return (
    <PageShell
      badge="Cài đặt"
      title="Tài khoản hệ thống"
      subtitle="Quản lý tài khoản đăng nhập, vai trò, dự án và màn hình được thao tác."
      actions={
        <>
          <Link
            href="/settings"
            className="inline-flex h-9 items-center gap-1 rounded-sm border border-border bg-surface px-3 text-sm hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
            Cài đặt
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void accountsQuery.refetch()}
            disabled={accountsQuery.isFetching}
          >
            <RefreshCw className={cn('h-4 w-4', accountsQuery.isFetching && 'animate-spin')} />
            Làm mới
          </Button>
          <Button variant="accent" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Thêm tài khoản
          </Button>
        </>
      }
    >
      {error && (
        <p className="mb-4 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Tìm username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <QueryBoundary
        isLoading={accountsQuery.isLoading}
        error={
          accountsQuery.error instanceof ApiError
            ? accountsQuery.error.message
            : accountsQuery.error
              ? 'Không tải được tài khoản'
              : null
        }
        onRetry={() => void accountsQuery.refetch()}
      >
        <DesignCard title="Tài khoản đăng nhập">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-label-caps text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 font-semibold">Username</th>
                  <th className="p-3 font-semibold">Vai trò</th>
                  <th className="p-3 font-semibold">Dự án</th>
                  <th className="p-3 font-semibold">Màn hình</th>
                  <th className="p-3 font-semibold">Trạng thái</th>
                  <th className="p-3 font-semibold">Đổi MK</th>
                  <th className="p-3 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Chưa có tài khoản
                    </td>
                  </tr>
                )}
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{row.username}</td>
                    <td className="p-3">
                      <Badge variant="secondary">{row.role.name}</Badge>
                    </td>
                    <td className="max-w-[240px] truncate p-3 text-xs" title={row.projects.map((p) => p.name).join(', ')}>
                      {row.projects.length ? row.projects.map((p) => p.name).join(', ') : '—'}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {row.role.code === 'ADMIN'
                        ? 'Tất cả'
                        : `${row.allowedRoutes?.length ?? 0} màn`}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={row.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}
                      >
                        {row.isActive ? 'Hoạt động' : 'Vô hiệu'}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs">
                      {row.mustChangePassword ? 'Bắt buộc' : 'Đã đổi'}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TablePager
            currentPage={page}
            totalPages={totalPages}
            total={total}
            unit="tài khoản"
            onPageChange={setPage}
          />
        </DesignCard>
      </QueryBoundary>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Sửa tài khoản' : 'Thêm tài khoản'}
        className="w-[min(96vw,1600px)] max-w-none"
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.45fr)]">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium">
                Username
                {!editing && <RequiredMark />}
              </label>
              <Input
                value={form.username}
                disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="staff1"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Mật khẩu {editing ? '(để trống nếu không đổi)' : <RequiredMark />}
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Tối thiểu 8 ký tự"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Vai trò
                <RequiredMark />
              </label>
              <Select
                value={form.roleId}
                onChange={(e) => onRoleChange(e.target.value)}
              >
                <option value="">— Chọn vai trò —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium">
                Dự án được gán
                {needsProjects && <RequiredMark />}
              </label>
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-sm border border-border p-3">
                {projects.length === 0 && (
                  <p className="text-xs text-muted-foreground">Chưa có dự án</p>
                )}
                {projects.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.projectIds.includes(p.id)}
                      onChange={() => toggleProject(p.id)}
                      className="rounded border-border"
                    />
                    <span>
                      {p.name} <span className="font-mono text-xs text-muted-foreground">({p.code})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="rounded border-border"
              />
              Tài khoản hoạt động
            </label>
            {editing && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.mustChangePassword}
                  onChange={(e) => setForm((f) => ({ ...f, mustChangePassword: e.target.checked }))}
                  className="rounded border-border"
                />
                Bắt buộc đổi mật khẩu lần đăng nhập sau
              </label>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium">
                Màn hình được thao tác
              </label>
              {isAdminRole ? (
                <p className="rounded-sm border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Administrator luôn truy cập mọi màn hình.
                </p>
              ) : (
                <div className="rounded-sm border border-border bg-muted/20 p-4">
                  <div className="grid grid-cols-1 gap-3 2xl:grid-cols-3">
                    {CONFIGURABLE_ROUTES.map((item) => {
                      const locked = item.prefix === '/home';
                      const checked = form.allowedRoutes.includes(item.prefix);
                      return (
                        <label
                          key={item.prefix}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-sm border px-3 py-2.5 text-sm transition-colors',
                            checked
                              ? 'border-primary/30 bg-primary/5'
                              : 'border-border bg-surface hover:bg-muted/40',
                            locked && 'cursor-not-allowed opacity-70',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 rounded border-border"
                            checked={checked}
                            disabled={locked}
                            onChange={() => toggleRoute(item.prefix)}
                          />
                          <span className="min-w-0">
                            <span className="block leading-5 text-foreground">{item.label}</span>
                            <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                              {item.prefix}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button
            variant="accent"
            size="sm"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="Xóa tài khoản"
        message={`Bạn có chắc muốn xóa tài khoản ${deleteTarget?.username ?? ''}?`}
        confirmLabel="Xóa"
        loading={deleteMutation.isPending}
      />
    </PageShell>
  );
}
