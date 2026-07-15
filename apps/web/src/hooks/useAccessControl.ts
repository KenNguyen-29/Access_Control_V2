'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccessZone,
  Device,
  UserAccessPermission,
  WorkShift,
} from '@/lib/api';
import {
  createAccessZone,
  createPermission,
  deletePermission,
  getAccessZones,
  getAccessZoneSchedules,
  getDevices,
  getPermissions,
  getWorkShifts,
  syncUserCredentials,
  updateAccessZone,
  updateAccessZoneSchedules,
  updateDevice,
} from '@/lib/api';
import type { AccessGroup, AccessPerson, AccessPoint } from '@/lib/accessControl';
import type { AccessSyncFailedEntry, AccessSyncReport } from '@/lib/accessSync';

function buildGroups(
  zones: AccessZone[],
  permissions: UserAccessPermission[],
  devices: Device[],
  schedules: Record<string, string>,
  workShifts: WorkShift[],
): AccessGroup[] {
  const defaultSchedule = workShifts[0]?.name ?? 'Cả ngày';
  const zoneDevices = new Map<string, Device[]>();

  devices.forEach((d) => {
    if (!d.zoneId) return;
    const list = zoneDevices.get(d.zoneId) ?? [];
    list.push(d);
    zoneDevices.set(d.zoneId, list);
  });

  return zones.map((zone) => {
    const zonePerms = permissions.filter((p) => p.zoneId === zone.id);
    const persons: AccessPerson[] = zonePerms.map((p) => ({
      id: p.userId,
      name: p.user?.fullName ?? p.userId,
      personId: p.user?.employeeCode ?? p.userId.slice(0, 8),
      organization: p.user?.department?.name ?? '—',
    }));

    const accessPoints: AccessPoint[] = (zoneDevices.get(zone.id) ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      groupName: zone.name,
    }));

    return {
      id: zone.id,
      name: zone.name,
      scheduleTemplate: schedules[zone.id] ?? defaultSchedule,
      persons,
      accessPoints,
      status: 'applied' as const,
    };
  });
}

export type AccessApplyResult = AccessSyncReport;

export function useAccessControl() {
  const queryClient = useQueryClient();
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [applying, setApplying] = useState(false);

  const query = useQuery({
    queryKey: ['accessControl'],
    queryFn: async () => {
      const [zones, permissions, devicesRes, shifts, schedulesRes] = await Promise.all([
          getAccessZones(),
          getPermissions(),
          getDevices({ pageSize: 100 }),
          getWorkShifts(),
          getAccessZoneSchedules(),
        ]);
      return {
        zones,
        permissions,
        devices: devicesRes.items,
        shifts,
        schedules: schedulesRes.schedules ?? {},
      };
    },
  });

  const devices: Device[] = useMemo(() => query.data?.devices ?? [], [query.data]);
  const workShifts: WorkShift[] = useMemo(() => query.data?.shifts ?? [], [query.data]);
  const loading = query.isLoading;
  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : 'Không tải được kiểm soát truy cập'
    : null;

  // Keep a local groups copy so applyGroups can patch per-zone status until next refetch.
  const builtGroups = useMemo(() => {
    if (!query.data) return [];
    return buildGroups(
      query.data.zones,
      query.data.permissions,
      query.data.devices,
      query.data.schedules,
      query.data.shifts,
    );
  }, [query.data]);

  useEffect(() => {
    setGroups(builtGroups);
  }, [builtGroups]);

  const load = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['accessControl'] });
  }, [queryClient]);

  const accessPointOptions = useMemo(
    () =>
      devices.map((d) => ({
        id: d.id,
        name: d.name,
        groupName: d.location ?? d.code ?? 'Thiết bị',
      })),
    [devices],
  );

  const scheduleTemplates = useMemo(
    () =>
      workShifts.length > 0
        ? workShifts.map((s) => s.name)
        : ['Cả ngày', 'Ngày làm việc', 'Ca đêm', 'Cuối tuần hạn chế'],
    [workShifts],
  );

  const saveGroup = useCallback(
    async (data: Omit<AccessGroup, 'id' | 'status'>, editGroupId?: string) => {
      let zoneId: string;

      if (editGroupId) {
        zoneId = editGroupId;
        await updateAccessZone(zoneId, { name: data.name });
      } else {
        const zone = await createAccessZone({ name: data.name });
        zoneId = zone.id;
      }

      const schedulesRes = await getAccessZoneSchedules();
      const schedules = {
        ...(schedulesRes.schedules ?? {}),
        [zoneId]: data.scheduleTemplate,
      };
      await updateAccessZoneSchedules(schedules);

      const existing = await getPermissions({ zoneId });
      await Promise.all(existing.map((p) => deletePermission(p.id)));

      await Promise.all(
        data.persons.map((p) => createPermission({ userId: p.id, zoneId })),
      );

      const targetDeviceIds = new Set(data.accessPoints.map((p) => p.id));
      const zoneDevices = devices.filter((d) => d.zoneId === zoneId);

      await Promise.all([
        ...zoneDevices
          .filter((d) => !targetDeviceIds.has(d.id))
          .map((d) => updateDevice(d.id, { zoneId: null })),
        ...data.accessPoints.map((p) => updateDevice(p.id, { zoneId })),
      ]);

      await load();
    },
    [devices, load],
  );

  const deleteGroups = useCallback(
    async (zoneIds: string[]) => {
      for (const zoneId of zoneIds) {
        const perms = await getPermissions({ zoneId });
        await Promise.all(perms.map((p) => deletePermission(p.id)));
      }

      const schedulesRes = await getAccessZoneSchedules();
      const schedules = { ...(schedulesRes.schedules ?? {}) };
      zoneIds.forEach((id) => {
        delete schedules[id];
      });
      await updateAccessZoneSchedules(schedules);

      await load();
    },
    [load],
  );

  const applyGroups = useCallback(
    async (zoneIds: string[]): Promise<AccessApplyResult> => {
      setApplying(true);
      try {
        const allFailed: AccessSyncFailedEntry[] = [];
        let totalSynced = 0;
        let totalAttempts = 0;

        for (const zoneId of zoneIds) {
          const group = groups.find((g) => g.id === zoneId);
          if (!group || group.persons.length === 0) continue;

          for (const person of group.persons) {
            totalAttempts += 1;
            try {
              const result = await syncUserCredentials(person.id, zoneId);
              totalSynced += result.synced ?? 0;
            } catch (e) {
              const message = e instanceof Error ? e.message : 'Đồng bộ thất bại';
              if (group.accessPoints.length === 0) {
                allFailed.push({
                  deviceId: zoneId,
                  deviceName: group.name,
                  success: false,
                  error: `${person.name}: ${message}`,
                });
              } else {
                for (const point of group.accessPoints) {
                  allFailed.push({
                    deviceId: point.id,
                    deviceName: point.name,
                    success: false,
                    error: `${person.name}: ${message}`,
                  });
                }
              }
            }
          }
        }

        const zoneResults = new Map<string, AccessGroup['status']>();
        for (const zoneId of zoneIds) {
          const group = groups.find((g) => g.id === zoneId);
          if (!group) continue;
          const zoneDeviceIds = new Set(group.accessPoints.map((p) => p.id));
          const zoneFailed = allFailed.filter(
            (f) => zoneDeviceIds.has(f.deviceId) || f.deviceId === zoneId,
          );
          if (zoneFailed.length === 0 && group.persons.length > 0) {
            zoneResults.set(zoneId, 'applied');
          } else if (totalSynced > 0 && zoneFailed.length > 0) {
            zoneResults.set(zoneId, 'partial');
          } else if (group.persons.length > 0 && zoneFailed.length > 0) {
            zoneResults.set(zoneId, 'failed');
          } else {
            zoneResults.set(zoneId, 'applied');
          }
        }

        setGroups((prev) =>
          prev.map((g) =>
            zoneResults.has(g.id) ? { ...g, status: zoneResults.get(g.id)! } : g,
          ),
        );

        return {
          success: allFailed.length === 0,
          synced: totalSynced,
          total: Math.max(totalAttempts, totalSynced + allFailed.length),
          failed: allFailed,
        };
      } finally {
        setApplying(false);
      }
    },
    [groups],
  );

  return {
    groups,
    loading,
    error,
    applying,
    refetch: load,
    accessPointOptions,
    scheduleTemplates,
    saveGroup,
    deleteGroups,
    applyGroups,
    setGroups,
  };
}
