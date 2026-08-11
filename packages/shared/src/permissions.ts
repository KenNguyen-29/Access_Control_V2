export type AppRole = 'ADMIN' | 'HR' | 'SECURITY' | 'TECHNICIAN' | 'STAFF';

/** Routes → roles allowed (prefix match, longest wins). */
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
