'use client';

import { Fragment, useEffect, useMemo, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import type { User } from '@/lib/api';
import { useUsersInfinite, type UsersInfiniteParams } from '@/hooks/useUsersInfinite';

type UserInfiniteListProps = UsersInfiniteParams & {
  renderItem: (user: User) => React.ReactNode;
  emptyText?: string;
  className?: string;
};

function dedupeUsersById(items: User[]): User[] {
  const seen = new Set<string>();
  const out: User[] = [];
  for (const user of items) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    out.push(user);
  }
  return out;
}

export function UserInfiniteList({
  renderItem,
  emptyText = 'Không có dữ liệu',
  className,
  ...params
}: UserInfiniteListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const query = useUsersInfinite(params);

  const users = useMemo(
    () => dedupeUsersById(query.data?.pages.flatMap((p) => p.items) ?? []),
    [query.data?.pages],
  );
  const hasMore = query.hasNextPage ?? false;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || query.isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      },
      { rootMargin: '120px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, query]);

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Đang tải...
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="p-4 text-center text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : 'Không tải được danh sách'}
      </p>
    );
  }

  if (users.length === 0) {
    return <p className="p-4 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className={className}>
      {users.map((user) => (
        <Fragment key={user.id}>{renderItem(user)}</Fragment>
      ))}
      <div ref={sentinelRef} className="h-1" aria-hidden />
      {query.isFetchingNextPage && (
        <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          Đang tải thêm...
        </div>
      )}
    </div>
  );
}
