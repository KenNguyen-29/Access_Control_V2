import {
  CameraConnectionSource,
  DeviceType,
  EmployeeShiftAssignType,
  PrismaClient,
} from '@prisma/client';

type Options = {
  ip: string;
  akuvoxCode: string;
  cameraCode: string;
  akuvoxName: string;
  cameraName: string;
  zoneName: string;
  projectId?: string;
  zoneId?: string;
  employeeCode?: string;
  username: string;
  password: string;
  rtspUrl?: string;
  rtspPath: string;
};

function parseArgs(argv: string[]): Options {
  const values: Options = {
    ip: '192.168.1.4',
    akuvoxCode: 'SIM-AKUVOX-14',
    cameraCode: 'SIM-CAM-14',
    akuvoxName: 'Akuvox giả lập · 192.168.1.4',
    cameraName: 'Camera giả lập · 192.168.1.4',
    zoneName: 'Khu vuc gia lap - 192.168.1.4',
    projectId: undefined,
    zoneId: undefined,
    employeeCode: 'SIM-NV-14',
    username: process.env.MOCK_CAMERA_USERNAME?.trim() || 'admin',
    password: process.env.MOCK_CAMERA_PASSWORD || 'admin123',
    rtspUrl: undefined,
    rtspPath: '/rtsp/streaming?channel=1&subtype=0',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith('--')) continue;
    const [rawKey, inline] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()) as keyof Options;
    const next = inline ?? argv[i + 1];
    if (inline == null && next && !next.startsWith('--')) i += 1;
    if (next == null || next.startsWith('--') || !(key in values)) continue;
    (values as unknown as Record<string, string>)[key] = next;
  }
  return values;
}

function cleanIp(value: string): string {
  const ip = value.trim();
  if (!/^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(ip)) {
    throw new Error(`IP không hợp lệ: ${value}`);
  }
  return ip;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const ip = cleanIp(options.ip);
  const prisma = new PrismaClient();

  try {
    const project = options.projectId
      ? await prisma.project.findFirst({ where: { id: options.projectId, isDeleted: false } })
      : await prisma.project.findFirst({ where: { isDeleted: false }, orderBy: { createdAt: 'asc' } });
    if (!project) throw new Error('Chưa có dự án để gắn camera giả lập.');

    let zone = options.zoneId
      ? await prisma.accessZone.findFirst({ where: { id: options.zoneId, isDeleted: false } })
      : await prisma.accessZone.findFirst({
          where: { name: options.zoneName, isDeleted: false },
          orderBy: { createdAt: 'asc' },
        });
    if (!zone) {
      zone = await prisma.accessZone.create({
        data: {
          name: options.zoneName,
          description: 'Dùng riêng cho simulator Akuvox/camera 192.168.1.4',
        },
      });
    }

    const serviceUrl = `http://${ip}/onvif/device_service`;
    const rtspUrl = options.rtspUrl?.trim() ||
      `rtsp://${ip}:554${options.rtspPath.startsWith('/') ? options.rtspPath : `/${options.rtspPath}`}`;
    try {
      const parsedRtsp = new URL(rtspUrl);
      if (!['rtsp:', 'rtsps:'].includes(parsedRtsp.protocol) || parsedRtsp.hostname !== ip) {
        throw new Error('host mismatch');
      }
    } catch {
      throw new Error(`RTSP URL phải trỏ đúng IP ${ip}`);
    }
    const camera = await prisma.device.upsert({
      where: { code: options.cameraCode },
      create: {
        name: options.cameraName,
        code: options.cameraCode,
        deviceType: DeviceType.CAMERA,
        ipAddress: ip,
        location: 'Simulator',
        projectId: project.id,
        rtspUrl,
        rtspUsername: options.username,
        rtspPassword: options.password,
        connectionSource: CameraConnectionSource.ONVIF,
        onvifServiceUrl: serviceUrl,
        onvifProfileToken: 'mock-profile-1',
        onvifPort: 80,
        manufacturer: 'Access Control Simulator',
        model: 'Mock Akuvox Camera',
        isOnline: true,
      },
      update: {
        name: options.cameraName,
        deviceType: DeviceType.CAMERA,
        ipAddress: ip,
        location: 'Simulator',
        projectId: project.id,
        rtspUrl,
        rtspUsername: options.username,
        rtspPassword: options.password,
        connectionSource: CameraConnectionSource.ONVIF,
        onvifServiceUrl: serviceUrl,
        onvifProfileToken: 'mock-profile-1',
        onvifPort: 80,
        manufacturer: 'Access Control Simulator',
        model: 'Mock Akuvox Camera',
        lastConnectionError: null,
        isDeleted: false,
        isOnline: true,
      },
    });

    const panel = await prisma.device.upsert({
      where: { code: options.akuvoxCode },
      create: {
        name: options.akuvoxName,
        code: options.akuvoxCode,
        deviceType: DeviceType.AKUVOX,
        ipAddress: ip,
        location: 'Simulator',
        zoneId: zone.id,
        projectId: project.id,
        rtspUrl,
        connectionSource: CameraConnectionSource.ONVIF,
        onvifServiceUrl: serviceUrl,
        onvifProfileToken: 'mock-profile-1',
        onvifPort: 80,
        manufacturer: 'Access Control Simulator',
        model: 'Mock Akuvox Panel',
        akuvoxConfig: { username: options.username, password: options.password, protocol: 'http', relay: 1 },
        isOnline: true,
      },
      update: {
        name: options.akuvoxName,
        deviceType: DeviceType.AKUVOX,
        ipAddress: ip,
        location: 'Simulator',
        zoneId: zone.id,
        projectId: project.id,
        rtspUrl,
        connectionSource: CameraConnectionSource.ONVIF,
        onvifServiceUrl: serviceUrl,
        onvifProfileToken: 'mock-profile-1',
        onvifPort: 80,
        manufacturer: 'Access Control Simulator',
        model: 'Mock Akuvox Panel',
        akuvoxConfig: { username: options.username, password: options.password, protocol: 'http', relay: 1 },
        lastConnectionError: null,
        isDeleted: false,
        isOnline: true,
      },
    });

    // This panel is simulator-owned, so stale simulator mappings are safe to retire.
    await prisma.deviceCameraMapping.updateMany({
      where: { akuvoxDeviceId: panel.id, cameraDeviceId: { not: camera.id }, isDeleted: false },
      data: { isDeleted: true },
    });
    await prisma.deviceCameraMapping.upsert({
      where: {
        akuvoxDeviceId_cameraDeviceId: {
          akuvoxDeviceId: panel.id,
          cameraDeviceId: camera.id,
        },
      },
      create: { akuvoxDeviceId: panel.id, cameraDeviceId: camera.id, priority: 0 },
      update: { isDeleted: false, priority: 0 },
    });

    const isSimulatorUser = !options.employeeCode || options.employeeCode === 'SIM-NV-14';
    const user = isSimulatorUser
      ? await prisma.user.upsert({
          where: { employeeCode: 'SIM-NV-14' },
          create: {
            employeeCode: 'SIM-NV-14',
            fullName: 'Nhân sự giả lập · 192.168.1.4',
            projectId: project.id,
            isActive: true,
            isDeleted: false,
          },
          update: {
            fullName: 'Nhân sự giả lập · 192.168.1.4',
            projectId: project.id,
            isActive: true,
            isDeleted: false,
          },
        })
      : await prisma.user.findFirst({
          where: { employeeCode: options.employeeCode, isDeleted: false },
        });
    if (!user) {
      throw new Error(
        `Không tìm thấy nhân sự cho simulator. Truyền --employee-code <mã> (hoặc tạo nhân sự trước).`,
      );
    }
    await prisma.userAccessPermission.upsert({
      where: { userId_zoneId: { userId: user.id, zoneId: zone.id } },
      create: { userId: user.id, zoneId: zone.id },
      update: { isDeleted: false, validFrom: null, validTo: null },
    });

    if (isSimulatorUser) {
      const shift = await prisma.workShift.upsert({
        where: { code: 'SIM-SHIFT-14' },
        create: {
          code: 'SIM-SHIFT-14',
          name: 'Ca giả lập 08:00–17:00',
          startTime: '08:00',
          endTime: '17:00',
          breakMinutes: 0,
          gracePeriodMinutes: 5,
          salaryCoefficient: 1,
          isOvernight: false,
          isDefault: false,
          isDeleted: false,
        },
        update: {
          name: 'Ca giả lập 08:00–17:00',
          startTime: '08:00',
          endTime: '17:00',
          isOvernight: false,
          isDeleted: false,
        },
      });
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const assignment = await prisma.employeeShift.findFirst({
        where: { userId: user.id, workShiftId: shift.id },
      });
      if (assignment) {
        await prisma.employeeShift.update({
          where: { id: assignment.id },
          data: {
            startDate: today,
            endDate: null,
            assignmentType: EmployeeShiftAssignType.FIXED,
            isDeleted: false,
          },
        });
      } else {
        await prisma.employeeShift.create({
          data: {
            userId: user.id,
            workShiftId: shift.id,
            startDate: today,
            endDate: null,
            assignmentType: EmployeeShiftAssignType.FIXED,
          },
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          project: { id: project.id, name: project.name },
          zone: { id: zone.id, name: zone.name },
          akuvox: { id: panel.id, code: panel.code, ip: panel.ipAddress },
          camera: { id: camera.id, code: camera.code, ip: camera.ipAddress, rtspUrl },
          employee: { id: user.id, employeeCode: user.employeeCode, fullName: user.fullName },
          note: 'Đã gắn camera giả lập vào Akuvox giả lập; IP 192.168.1.4 chỉ là metadata ảo.',
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
