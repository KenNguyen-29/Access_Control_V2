/** Màn hình admin có thể bật/tắt theo từng tài khoản đăng nhập. */
export const CONFIGURABLE_ROUTES: Array<{ prefix: string; label: string; group: string }> = [
  { prefix: '/home', label: 'Trang chủ', group: 'Chung' },
  { prefix: '/dashboard', label: 'Giám sát', group: 'Vận hành' },
  { prefix: '/reports', label: 'Chấm công', group: 'Vận hành' },
  { prefix: '/reports/contractors', label: 'BC nhà thầu', group: 'Vận hành' },
  { prefix: '/projects', label: 'Dự án & Nhà thầu', group: 'Vận hành' },
  { prefix: '/muster', label: 'Sơ tán khẩn cấp', group: 'Vận hành' },
  { prefix: '/users', label: 'Nhân sự', group: 'Quản lý' },
  { prefix: '/shifts', label: 'Ca làm', group: 'Quản lý' },
  { prefix: '/access-control', label: 'Phân quyền ra vào', group: 'Quản lý' },
  { prefix: '/devices', label: 'Thiết bị', group: 'Quản lý' },
  { prefix: '/settings', label: 'Cài đặt (chung)', group: 'Cài đặt' },
  { prefix: '/settings/departments', label: 'Phòng ban', group: 'Cài đặt' },
  { prefix: '/settings/contractors', label: 'Nhà thầu & Dự án', group: 'Cài đặt' },
  { prefix: '/settings/zones', label: 'Khu vực', group: 'Cài đặt' },
  { prefix: '/settings/credentials', label: 'Credential / FaceID', group: 'Cài đặt' },
  { prefix: '/settings/storage', label: 'Lưu trữ', group: 'Cài đặt' },
  { prefix: '/settings/audit', label: 'Audit log', group: 'Cài đặt' },
  { prefix: '/settings/accounts', label: 'Tài khoản hệ thống', group: 'Cài đặt' },
];

const ALL_PREFIXES = CONFIGURABLE_ROUTES.map((r) => r.prefix);

/** Mặc định khớp ROUTE_RULES hiện tại — dùng seed & fallback. */
export const DEFAULT_ALLOWED_ROUTES: Record<string, string[]> = {
  ADMIN: [...ALL_PREFIXES],
  HR: [
    '/home',
    '/users',
    '/shifts',
    '/reports',
    '/reports/contractors',
    '/projects',
    '/settings',
    '/settings/departments',
    '/settings/contractors',
    '/settings/zones',
    '/settings/credentials',
  ],
  SECURITY: ['/home', '/dashboard', '/muster'],
  TECHNICIAN: ['/home', '/devices'],
  STAFF: ['/home', '/dashboard', '/users', '/reports', '/reports/contractors', '/projects'],
};

export function defaultAllowedRoutesForRole(role: string): string[] {
  return DEFAULT_ALLOWED_ROUTES[role] ?? ['/home'];
}

export function normalizeAllowedRoutes(routes: unknown): string[] {
  if (!Array.isArray(routes)) return [];
  const valid = new Set(ALL_PREFIXES);
  return [...new Set(routes.filter((r): r is string => typeof r === 'string' && valid.has(r)))];
}
