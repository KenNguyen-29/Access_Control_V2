import {
  defaultAllowedRoutesForRole,
  normalizeAllowedRoutes,
} from './route-catalog';

export type AppRole = 'ADMIN' | 'HR' | 'SECURITY' | 'TECHNICIAN' | 'STAFF';

/** Routes → roles allowed (prefix match, longest wins). Fallback khi DB chưa có allowedRoutes. */
const ROUTE_RULES: Array<{ prefix: string; roles: AppRole[] }> = [
  { prefix: '/settings/accounts', roles: ['ADMIN'] },
  { prefix: '/settings', roles: ['ADMIN', 'HR'] },
  { prefix: '/access-control', roles: ['ADMIN'] },
  { prefix: '/devices', roles: ['ADMIN', 'TECHNICIAN'] },
  { prefix: '/shifts', roles: ['ADMIN', 'HR'] },
  { prefix: '/muster', roles: ['ADMIN', 'SECURITY'] },
  { prefix: '/dashboard', roles: ['ADMIN', 'STAFF', 'SECURITY'] },
  { prefix: '/reports', roles: ['ADMIN', 'STAFF', 'HR'] },
  { prefix: '/projects', roles: ['ADMIN', 'STAFF', 'HR'] },
  { prefix: '/users', roles: ['ADMIN', 'STAFF', 'HR'] },
  { prefix: '/home', roles: ['ADMIN', 'HR', 'SECURITY', 'TECHNICIAN', 'STAFF'] },
];

const NAV_TAB_IDS: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/users': 'users',
  '/access-control': 'access-control',
  '/shifts': 'shifts',
  '/devices': 'devices',
  '/reports': 'reports',
  '/settings': 'settings',
};

export function normalizePath(path: string): string {
  const p = path.split('?')[0] ?? path;
  if (p === '/') return '/home';
  return p.replace(/\/$/, '') || '/home';
}

function matchesAllowedPrefix(normalized: string, allowedPrefixes: string[]): boolean {
  let bestLen = -1;
  let matched = false;
  for (const prefix of allowedPrefixes) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      if (prefix.length > bestLen) {
        bestLen = prefix.length;
        matched = true;
      }
    }
  }
  return matched;
}

/** /projects và /settings/contractors đã gộp một màn — quyền một bên mở được cả hai URL. */
function withMergedProjectRoutes(prefixes: string[]): string[] {
  const set = new Set(prefixes);
  if (set.has('/projects') || set.has('/settings/contractors')) {
    set.add('/projects');
    set.add('/settings/contractors');
  }
  return [...set];
}

/** Static rules — dùng khi chưa có cấu hình DB. */
export function canAccessRoute(role: string, path: string): boolean {
  const normalized = normalizePath(path);
  let matched: AppRole[] | null = null;
  let bestLen = -1;
  for (const rule of ROUTE_RULES) {
    if (normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`)) {
      if (rule.prefix.length > bestLen) {
        bestLen = rule.prefix.length;
        matched = rule.roles;
      }
    }
  }
  if (!matched) return role === 'ADMIN';
  return matched.includes(role as AppRole);
}

/** Kiểm tra quyền màn theo danh sách prefix từ DB (admin luôn full). */
export function canAccessRouteWithAllowed(
  role: string,
  path: string,
  allowedRoutes?: string[] | null,
): boolean {
  if (role === 'ADMIN') return true;
  const normalized = normalizePath(path);
  const routes = withMergedProjectRoutes(normalizeAllowedRoutes(allowedRoutes));
  if (routes.length > 0) {
    return matchesAllowedPrefix(normalized, routes);
  }
  return canAccessRoute(role, path);
}

export function resolveAllowedRoutes(role: string, stored: unknown): string[] {
  const routes = normalizeAllowedRoutes(stored);
  if (routes.length > 0) return routes;
  return defaultAllowedRoutesForRole(role);
}

export function canAccessNavTab(role: string, href: string): boolean {
  return canAccessRoute(role, href);
}

export function canWriteUsers(role: string): boolean {
  return role === 'ADMIN' || role === 'HR';
}

export function canManageAccounts(role: string): boolean {
  return role === 'ADMIN';
}

export function canManageProjects(role: string): boolean {
  return role === 'ADMIN';
}

export function isProjectScopedRole(role: string): boolean {
  return role === 'STAFF' || role === 'HR';
}

export function rolesRequiringProjects(role: string): boolean {
  return role === 'STAFF' || role === 'HR';
}
