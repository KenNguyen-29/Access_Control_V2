'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@/lib/api';

/** Nest --watch restarts leave ~2–5s with nothing on :8080 → ERR_CONNECTION_REFUSED. */
function isTransientNetworkError(error: unknown) {
  if (error instanceof TypeError) return true; // Failed to fetch / NetworkError
  if (error instanceof ApiError) return error.status === 0 || error.status >= 500;
  return false;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                return false;
              }
              if (isTransientNetworkError(error)) return failureCount < 4;
              return failureCount < 1;
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
