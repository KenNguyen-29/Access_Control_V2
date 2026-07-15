export const ACCESS_ZONE_SCHEDULES_KEY = 'ACCESS_ZONE_SCHEDULES_JSON';

export const ALL_DAY_SHIFT_NAMES = new Set([
  'all day authorized',
  'all day',
  '24/7',
  'always',
  'cả ngày',
]);

export function isAllDayScheduleName(shiftName: string): boolean {
  return ALL_DAY_SHIFT_NAMES.has(shiftName.trim().toLowerCase());
}
