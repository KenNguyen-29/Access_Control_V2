import { syncUserCredentials } from '@/lib/api';

export interface AccessSyncFailedEntry {
  deviceId: string;
  deviceName: string;
  success: false;
  error?: string;
}

export interface AccessSyncReport {
  success: boolean;
  synced: number;
  total: number;
  failed: AccessSyncFailedEntry[];
}

/**
 * Sync a user's credentials to devices in a zone (or all permitted zones).
 * V2 API handles device selection server-side — one call per user.
 */
export async function syncUserToZoneDevices(
  userId: string,
  zoneId?: string,
): Promise<AccessSyncReport> {
  try {
    const result = await syncUserCredentials(userId, zoneId);
    const synced = result.synced ?? 0;
    const total = result.devices ?? synced;
    return {
      success: true,
      synced,
      total,
      failed: [],
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Đồng bộ thất bại';
    return {
      success: false,
      synced: 0,
      total: 1,
      failed: [
        {
          deviceId: zoneId ?? 'unknown',
          deviceName: zoneId ? `Khu vực ${zoneId}` : 'Thiết bị',
          success: false,
          error: message,
        },
      ],
    };
  }
}

export function mergeSyncReports(reports: AccessSyncReport[]): AccessSyncReport {
  const failed: AccessSyncFailedEntry[] = [];
  let synced = 0;
  let total = 0;

  for (const report of reports) {
    synced += report.synced;
    total += report.total;
    failed.push(...report.failed);
  }

  return {
    success: failed.length === 0,
    total,
    synced,
    failed,
  };
}
