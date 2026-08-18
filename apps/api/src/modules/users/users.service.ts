import { randomInt } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AkuvoxService } from '../devices/akuvox.service';
import { DnakeService } from '../devices/dnake.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CredentialsService } from '../credentials/credentials.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { TransferUserProjectDto } from './dto/transfer-user-project.dto';
import { UsersIdsQueryDto, UsersQueryDto } from './dto/users-query.dto';
import {
  basenamePath,
  cellToString,
  createUsersWorkbook,
  isHttpUrl,
  isValidImportEmail,
  isValidImportPhone,
  lookupZipImage,
  mapUserHeaderRow,
  normalizePhone,
  parseUserType,
  parseZoneNames,
  workbookToBuffer,
  type UserExcelColumnKey,
} from './users-excel.util';

export type UsersImportResult = {
  created: number;
  updated: number;
  skipped: number;
  facesEnrolled: number;
  zonesAssigned: number;
  errors: Array<{ row: number; message: string }>;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly permissions: PermissionsService,
    private readonly akuvox: AkuvoxService,
    private readonly dnake: DnakeService,
    private readonly credentials: CredentialsService,
  ) {}

  private buildWhere(
    query: {
      search?: string;
      departmentId?: string;
      contractorId?: string;
      projectId?: string;
    },
    scope?: { projectId?: string | { in: string[] } },
  ) {
    return {
      isDeleted: false,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.contractorId ? { contractorId: query.contractorId } : {}),
      ...scope,
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' as const } },
              { employeeCode: { contains: query.search, mode: 'insensitive' as const } },
              { citizenId: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  /** Attach a browser-reachable URL for the face image (skip if file missing on disk). */
  private async withFaceUrl<T extends { faceImagePath: string | null }>(user: T) {
    let faceImageUrl: string | null = null;
    if (user.faceImagePath) {
      const path = user.faceImagePath.replace(/\\/g, '/');
      if (path.startsWith('face-images/') && !this.storage.existsOnDisk(path)) {
        return { ...user, faceImageUrl: null };
      }
      try {
        faceImageUrl = await this.storage.getAssetUrl(path, { forBrowser: true });
      } catch {
        faceImageUrl = null;
      }
    }
    return { ...user, faceImageUrl };
  }

  async findAll(
    query: UsersQueryDto,
    scopeFilter?: { projectId?: string | { in: string[] } },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(query, scopeFilter);

    const [rawItems, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { department: true, contractor: true, project: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        // Secondary id keeps offset pagination stable when createdAt ties (bulk seed).
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = await Promise.all(rawItems.map((u) => this.withFaceUrl(u)));
    return { items, total, page, pageSize };
  }

  async findIds(
    query: UsersIdsQueryDto,
    scopeFilter?: { projectId?: string | { in: string[] } },
  ) {
    const where = this.buildWhere(query, scopeFilter);
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);
    return { ids: rows.map((r) => r.id), total };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      include: { department: true, credentials: true, contractor: true, project: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.withFaceUrl(user);
  }

  private nextEmployeeCode() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 4; i += 1) {
      suffix += alphabet[randomInt(alphabet.length)];
    }
    return `EMP${suffix}`;
  }

  async create(dto: CreateUserDto) {
    this.assertContractorRequired(dto.userType, dto.contractorId);
    await this.assertProjectContractorMatch(dto.projectId, dto.contractorId);
    const trimmedCode = dto.employeeCode?.trim();
    const baseData = {
      ...dto,
      employeeCode: trimmedCode || undefined,
    };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const user = await this.prisma.user.create({
          data: {
            ...baseData,
            employeeCode: baseData.employeeCode || this.nextEmployeeCode(),
          },
          include: { department: true, contractor: true, project: true },
        });
        return this.withFaceUrl(user);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const fields = Array.isArray(err.meta?.target)
            ? err.meta?.target.join(', ')
            : String(err.meta?.target ?? '');
          if (fields.includes('employeeCode')) {
            if (baseData.employeeCode) {
              throw new ConflictException('Mã nhân viên đã tồn tại');
            }
            continue;
          }
        }
        throw err;
      }
    }

    throw new ConflictException('Không thể tự sinh mã nhân viên, vui lòng thử lại');
  }

  private assertContractorRequired(userType?: UserType, contractorId?: string | null) {
    if (userType === UserType.CONTRACTOR && !contractorId) {
      throw new BadRequestException('Nhân viên loại nhà thầu phải chọn nhà thầu');
    }
  }

  private async assertProjectContractorMatch(
    projectId?: string | null,
    contractorId?: string | null,
  ) {
    if (!projectId || !contractorId) return;
    const link = await this.prisma.projectContractor.findUnique({
      where: {
        projectId_contractorId: { projectId, contractorId },
      },
      select: { id: true },
    });
    if (!link) {
      throw new BadRequestException('Nhà thầu không thuộc dự án đã chọn');
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.findOne(id);
    const nextType = dto.userType ?? existing.userType;
    const nextContractor =
      dto.contractorId !== undefined ? dto.contractorId : existing.contractorId;
    const nextProject = dto.projectId !== undefined ? dto.projectId : existing.projectId;
    this.assertContractorRequired(nextType, nextContractor);
    await this.assertProjectContractorMatch(nextProject, nextContractor);
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      include: { department: true, contractor: true, project: true },
    });
    return this.withFaceUrl(user);
  }

  async remove(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      include: {
        userAccessPermissions: {
          where: { isDeleted: false },
          select: { zoneId: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const zoneIds = [...new Set(user.userAccessPermissions.map((p) => p.zoneId))];

    // Push delete to panels while we still know which zones they were on.
    const [akuvoxRemove, dnakeRemove] = await Promise.all([
      this.akuvox
        .removeUserFromZones({ employeeCode: user.employeeCode, zoneIds })
        .catch((err) => ({
          removed: 0,
          devices: 0,
          results: [
            {
              deviceId: '',
              deviceName: '',
              zoneId: null as string | null,
              ok: false,
              error: err instanceof Error ? err.message : 'akuvox remove failed',
            },
          ],
          mock: false,
        })),
      this.dnake
        .removeUserFromZones({
          employeeCode: user.employeeCode,
          fullName: user.fullName,
          zoneIds,
        })
        .catch((err) => ({
          removed: 0,
          devices: 0,
          results: [
            {
              deviceId: '',
              deviceName: '',
              zoneId: null as string | null,
              ok: false,
              error: err instanceof Error ? err.message : 'dnake remove failed',
            },
          ],
          mock: false,
        })),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.userAccessPermission.updateMany({
        where: { userId: id, isDeleted: false },
        data: { isDeleted: true },
      });
      await tx.userDevicePermission.updateMany({
        where: { userId: id, isDeleted: false },
        data: { isDeleted: true },
      });
      await tx.credential.updateMany({
        where: { userId: id, isDeleted: false },
        data: { isDeleted: true, isActive: false },
      });
      // Soft-delete user — keep attendance / access logs / shifts for history
      await tx.user.update({
        where: { id },
        data: { isDeleted: true, isActive: false },
      });
    });

    const deviceFailures = [...akuvoxRemove.results, ...dnakeRemove.results].filter(
      (r) => !r.ok,
    );
    if (deviceFailures.length > 0) {
      this.logger.warn(
        `User ${user.employeeCode} soft-deleted but panel remove failed: ${deviceFailures
          .map((f) => `${f.deviceName || '?'}: ${f.error || 'fail'}`)
          .join('; ')}`,
      );
    }

    return {
      id,
      employeeCode: user.employeeCode,
      deviceRemove: {
        akuvox: akuvoxRemove,
        dnake: dnakeRemove,
        failed: deviceFailures.length,
      },
    };
  }

  /** Assign access zones and optionally push FaceID to each zone's Akuvox. */
  async provision(userId: string, dto: ProvisionUserDto) {
    await this.findOne(userId);
    const zoneIds = [...new Set(dto.zoneIds.filter(Boolean))];
    if (zoneIds.length === 0) {
      throw new BadRequestException('Cần ít nhất một khu vực');
    }

    const zones = await this.prisma.accessZone.findMany({
      where: { id: { in: zoneIds }, isDeleted: false },
      select: { id: true, name: true },
    });
    if (zones.length !== zoneIds.length) {
      throw new BadRequestException('Một hoặc nhiều khu vực không tồn tại');
    }

    for (const zoneId of zoneIds) {
      await this.permissions.assign({ userId, zoneId });
    }

    const autoSync = dto.autoSync !== false;
    const syncByZone: Array<{
      zoneId: string;
      zoneName: string;
      synced: number;
      devices: number;
      results: Array<{
        deviceId: string;
        deviceName: string;
        zoneId: string | null;
        zoneName?: string;
        ok: boolean;
        error?: string;
      }>;
      mock?: boolean;
    }> = [];

    if (autoSync) {
      for (const zone of zones) {
        try {
          const [akuvoxResult, dnakeResult] = await Promise.all([
            this.akuvox.syncUserCredentials(userId, zone.id).catch((err) => ({
              synced: 0,
              devices: 0,
              results: [
                {
                  deviceId: zone.id,
                  deviceName: zone.name,
                  zoneId: zone.id,
                  zoneName: zone.name,
                  ok: false,
                  error: err instanceof Error ? err.message : 'akuvox error',
                },
              ],
              mock: false,
            })),
            this.dnake.syncUserCredentials(userId, zone.id).catch((err) => ({
              synced: 0,
              devices: 0,
              results: [
                {
                  deviceId: zone.id,
                  deviceName: zone.name,
                  zoneId: zone.id,
                  zoneName: zone.name,
                  ok: false,
                  error: err instanceof Error ? err.message : 'dnake error',
                },
              ],
              mock: false,
            })),
          ]);
          syncByZone.push({
            zoneId: zone.id,
            zoneName: zone.name,
            synced: akuvoxResult.synced + dnakeResult.synced,
            devices: akuvoxResult.devices + dnakeResult.devices,
            results: [...(akuvoxResult.results ?? []), ...(dnakeResult.results ?? [])],
            mock: Boolean(akuvoxResult.mock || dnakeResult.mock),
          });
        } catch (err) {
          syncByZone.push({
            zoneId: zone.id,
            zoneName: zone.name,
            synced: 0,
            devices: 0,
            results: [
              {
                deviceId: zone.id,
                deviceName: zone.name,
                zoneId: zone.id,
                zoneName: zone.name,
                ok: false,
                error: err instanceof Error ? err.message : 'Đồng bộ thất bại',
              },
            ],
          });
        }
      }
    }

    return {
      userId,
      zoneIds,
      autoSync,
      syncByZone,
      synced: syncByZone.reduce((n, z) => n + z.synced, 0),
    };
  }

  /** Move CONTRACTOR to another project: revoke old zones, assign one new zone, optional shift, sync Face. */
  async transferProject(
    userId: string,
    dto: TransferUserProjectDto,
    byAccountId?: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.userType !== UserType.CONTRACTOR) {
      throw new BadRequestException('Chỉ điều chuyển được công nhân nhà thầu (CONTRACTOR)');
    }

    const toProject = await this.prisma.project.findFirst({
      where: { id: dto.toProjectId, isDeleted: false },
    });
    if (!toProject) throw new BadRequestException('Dự án đích không tồn tại');

    if (user.projectId && user.projectId === dto.toProjectId) {
      throw new BadRequestException('Người dùng đã thuộc dự án đích');
    }

    const zone = await this.prisma.accessZone.findFirst({
      where: { id: dto.zoneId, isDeleted: false },
    });
    if (!zone) throw new BadRequestException('Khu vực không tồn tại');

    if (dto.workShiftId) {
      const shift = await this.prisma.workShift.findFirst({
        where: { id: dto.workShiftId, isDeleted: false },
      });
      if (!shift) throw new BadRequestException('Ca làm việc không tồn tại');
    }

    const fromProjectId = user.projectId;

    const oldPerms = await this.prisma.userAccessPermission.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, zoneId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (oldPerms.length > 0) {
        await tx.userAccessPermission.updateMany({
          where: { userId, isDeleted: false },
          data: { isDeleted: true },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { projectId: dto.toProjectId },
      });

      const existingPerm = await tx.userAccessPermission.findFirst({
        where: { userId, zoneId: dto.zoneId },
      });
      if (existingPerm) {
        await tx.userAccessPermission.update({
          where: { id: existingPerm.id },
          data: { isDeleted: false, validFrom: null, validTo: null },
        });
      } else {
        await tx.userAccessPermission.create({
          data: { userId, zoneId: dto.zoneId },
        });
      }

      await tx.userProjectTransfer.create({
        data: {
          userId,
          fromProjectId,
          toProjectId: dto.toProjectId,
          byAccountId: byAccountId || null,
          note: dto.note?.trim() || null,
        },
      });

      if (dto.workShiftId) {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const todayUtc = new Date(`${todayStr}T00:00:00.000Z`);
        await tx.employeeShift.updateMany({
          where: {
            userId,
            assignmentType: 'FIXED',
            OR: [{ endDate: null }, { endDate: { gte: todayUtc } }],
          },
          data: { endDate: todayUtc },
        });
        await tx.employeeShift.create({
          data: {
            userId,
            workShiftId: dto.workShiftId,
            startDate: todayUtc,
            endDate: null,
            assignmentType: 'FIXED',
          },
        });
      }
    });

    const oldZoneIds = oldPerms.map((p) => p.zoneId).filter((zid) => zid !== dto.zoneId);
    if (oldZoneIds.length > 0) {
      await Promise.all([
        this.akuvox
          .removeUserFromZones({ employeeCode: user.employeeCode, zoneIds: oldZoneIds })
          .catch((err) => {
            this.logger.warn(
              `Transfer: Akuvox remove old zones failed user=${user.employeeCode}: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }),
        this.dnake
          .removeUserFromZones({
            employeeCode: user.employeeCode,
            fullName: user.fullName,
            zoneIds: oldZoneIds,
          })
          .catch((err) => {
            this.logger.warn(
              `Transfer: DNAKE remove old zones failed user=${user.employeeCode}: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }),
      ]);
    }

    const [akuvoxResult, dnakeResult] = await Promise.all([
      this.akuvox.syncUserCredentials(userId, dto.zoneId).catch((err) => ({
        synced: 0,
        devices: 0,
        results: [
          {
            deviceId: dto.zoneId,
            deviceName: zone.name,
            zoneId: dto.zoneId,
            zoneName: zone.name,
            ok: false,
            error: err instanceof Error ? err.message : 'akuvox error',
          },
        ],
        mock: false,
      })),
      this.dnake.syncUserCredentials(userId, dto.zoneId).catch((err) => ({
        synced: 0,
        devices: 0,
        results: [
          {
            deviceId: dto.zoneId,
            deviceName: zone.name,
            zoneId: dto.zoneId,
            zoneName: zone.name,
            ok: false,
            error: err instanceof Error ? err.message : 'dnake error',
          },
        ],
        mock: false,
      })),
    ]);

    const updated = await this.findOne(userId);
    return {
      user: updated,
      fromProjectId,
      toProjectId: dto.toProjectId,
      zoneId: dto.zoneId,
      revokedZoneIds: oldPerms.map((p) => p.zoneId),
      sync: {
        synced: (akuvoxResult.synced ?? 0) + (dnakeResult.synced ?? 0),
        devices: (akuvoxResult.devices ?? 0) + (dnakeResult.devices ?? 0),
        results: [...(akuvoxResult.results ?? []), ...(dnakeResult.results ?? [])],
        mock: Boolean(
          ('mock' in akuvoxResult && akuvoxResult.mock) ||
            ('mock' in dnakeResult && dnakeResult.mock),
        ),
      },
    };
  }

  async buildImportTemplateBuffer(): Promise<Buffer> {
    const { workbook, sheet } = createUsersWorkbook();
    sheet.addRow({
      fullName: 'Nguyễn Văn A',
      email: 'nguyenvana@example.com',
      phone: '0912345678',
      citizenId: '001234567890',
      department: 'Phòng Nhân sự',
      contractor: 'NhaThauA',
      project: 'DuAn1',
      userType: 'CONTRACTOR',
      faceImage: 'nguyen-van-a.jpg',
      zones: 'Khu vực chính; Khu văn phòng',
    });
    const tip = workbook.addWorksheet('Huong_dan');
    tip.getCell('A1').value =
      'Import gồm 2 file: Excel này + ZIP chứa ảnh JPG/PNG. Không dán ảnh vào sheet.';
    tip.getCell('A2').value =
      'Mã nhân viên được hệ thống tự sinh (không cần cột Mã NV). Cập nhật nhân viên cũ theo Email.';
    tip.getCell('A3').value =
      'Cột Ảnh: ghi đúng tên file trong ZIP (vd. nguyen-van-a.jpg). Có thể ghi folder/anh.jpg — hệ thống lấy tên file. Không dùng URL.';
    tip.getCell('A4').value =
      'Ô Ảnh trống = import nhân sự không gắn FaceID. Tên file không có trong ZIP = lỗi dòng đó.';
    tip.getCell('A5').value =
      'Cột Khu vực: nhiều khu vực, phân tách bằng dấu ; hoặc , (đúng tên khu vực trên hệ thống).';
    tip.getCell('A6').value =
      'Phòng ban / Nhà thầu / Dự án: ghi đúng tên hoặc mã đã tạo trên hệ thống. CCCD tùy chọn.';
    tip.getColumn(1).width = 110;
    return workbookToBuffer(workbook);
  }

  async importFromExcelAndPhotos(
    excel: Express.Multer.File,
    photosZip: Express.Multer.File,
  ): Promise<UsersImportResult> {
    const excelName = (excel.originalname || '').toLowerCase();
    if (!excelName.endsWith('.xlsx') && !excelName.endsWith('.xls')) {
      throw new BadRequestException('File nhân sự phải là Excel (.xlsx)');
    }
    const zipName = (photosZip.originalname || '').toLowerCase();
    if (!zipName.endsWith('.zip')) {
      throw new BadRequestException('File ảnh phải là ZIP (.zip)');
    }
    const zipImages = await this.indexPhotosZip(photosZip.buffer);
    if (zipImages.size === 0) {
      throw new BadRequestException('ZIP không chứa ảnh JPG/PNG');
    }
    return this.importFromExcelBuffer(excel.buffer, zipImages);
  }

  private async indexPhotosZip(buffer: Buffer): Promise<Map<string, Buffer>> {
    const zip = await JSZip.loadAsync(buffer);
    const imageFiles = new Map<string, Buffer>();
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const lower = path.replace(/\\/g, '/').toLowerCase();
      if (!lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.png')) {
        continue;
      }
      const data = Buffer.from(await entry.async('nodebuffer'));
      imageFiles.set(basenamePath(path).toLowerCase(), data);
      imageFiles.set(lower, data);
    }
    return imageFiles;
  }

  async importFromExcelBuffer(
    buffer: Buffer,
    zipImages: Map<string, Buffer> = new Map(),
  ): Promise<UsersImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.worksheets.find((s) => s.name !== 'Huong_dan') ?? workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('File Excel không có sheet nào');
    }

    const headerMap = mapUserHeaderRow(sheet.getRow(1));
    if (!headerMap.fullName || !headerMap.email || !headerMap.phone) {
      throw new BadRequestException(
        'Thiếu cột bắt buộc "Họ tên", "Email" hoặc "Số điện thoại" ở hàng tiêu đề',
      );
    }

    const result: UsersImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      facesEnrolled: 0,
      zonesAssigned: 0,
      errors: [],
    };

    const departments = await this.prisma.department.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true },
    });
    const deptByName = new Map(
      departments.map((d) => [d.name.trim().toLowerCase(), d.id] as const),
    );
    const contractors = await this.prisma.contractor.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, code: true },
    });
    const contractorByName = new Map(
      contractors.flatMap((c) => [
        [c.name.trim().toLowerCase(), c.id] as const,
        [c.code.trim().toLowerCase(), c.id] as const,
      ]),
    );
    const projects = await this.prisma.project.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, code: true },
    });
    const projectByName = new Map(
      projects.flatMap((p) => [
        [p.name.trim().toLowerCase(), p.id] as const,
        [p.code.trim().toLowerCase(), p.id] as const,
      ]),
    );

    const zones = await this.prisma.accessZone.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true },
    });
    const zoneByName = new Map(zones.map((z) => [z.name.trim().toLowerCase(), z.id] as const));

    const cell = (row: ExcelJS.Row, key: UserExcelColumnKey): string => {
      const col = headerMap[key];
      if (!col) return '';
      return cellToString(row.getCell(col).value);
    };

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const fullName = cell(row, 'fullName');
      const email = cell(row, 'email');
      const phoneRaw = cell(row, 'phone');
      const departmentName = cell(row, 'department');
      const citizenId = cell(row, 'citizenId') || undefined;
      const contractorName = cell(row, 'contractor');
      const projectName = cell(row, 'project');
      const userTypeRaw = cell(row, 'userType');
      const faceRaw = cell(row, 'faceImage');
      const zonesRaw = cell(row, 'zones');

      if (
        !fullName &&
        !email &&
        !phoneRaw &&
        !departmentName &&
        !faceRaw &&
        !zonesRaw &&
        !citizenId &&
        !contractorName &&
        !projectName
      ) {
        result.skipped += 1;
        continue;
      }

      if (!fullName || fullName.length < 2) {
        result.errors.push({ row: rowNumber, message: 'Họ tên bắt buộc (tối thiểu 2 ký tự)' });
        continue;
      }
      if (fullName.length > 100) {
        result.errors.push({ row: rowNumber, message: 'Họ tên tối đa 100 ký tự' });
        continue;
      }
      if (!email || !isValidImportEmail(email)) {
        result.errors.push({ row: rowNumber, message: 'Email không đúng định dạng' });
        continue;
      }
      if (!phoneRaw || !isValidImportPhone(phoneRaw)) {
        result.errors.push({
          row: rowNumber,
          message: 'Số điện thoại không đúng định dạng (vd. 0912345678)',
        });
        continue;
      }

      const phone = normalizePhone(phoneRaw);
      let userType: UserType = UserType.EMPLOYEE;
      if (userTypeRaw) {
        const parsed = parseUserType(userTypeRaw);
        if (!parsed) {
          result.errors.push({
            row: rowNumber,
            message: `Loại NV không hợp lệ "${userTypeRaw}" (EMPLOYEE / VISITOR / CONTRACTOR)`,
          });
          continue;
        }
        userType = parsed;
      }

      let departmentId: string | undefined;
      if (departmentName) {
        departmentId = deptByName.get(departmentName.trim().toLowerCase());
        if (!departmentId) {
          result.errors.push({
            row: rowNumber,
            message: `Không tìm thấy phòng ban "${departmentName}"`,
          });
          continue;
        }
      }

      let contractorId: string | undefined;
      if (contractorName) {
        contractorId = contractorByName.get(contractorName.trim().toLowerCase());
        if (!contractorId) {
          result.errors.push({
            row: rowNumber,
            message: `Không tìm thấy nhà thầu "${contractorName}"`,
          });
          continue;
        }
      }

      if (userType === UserType.CONTRACTOR && !contractorId) {
        result.errors.push({
          row: rowNumber,
          message: 'Loại CONTRACTOR bắt buộc cột Nhà thầu',
        });
        continue;
      }

      let projectId: string | undefined;
      if (projectName) {
        projectId = projectByName.get(projectName.trim().toLowerCase());
        if (!projectId) {
          result.errors.push({
            row: rowNumber,
            message: `Không tìm thấy dự án "${projectName}"`,
          });
          continue;
        }
      }

      if (projectId && contractorId) {
        const link = await this.prisma.projectContractor.findUnique({
          where: {
            projectId_contractorId: { projectId, contractorId },
          },
          select: { id: true },
        });
        if (!link) {
          result.errors.push({
            row: rowNumber,
            message: `Nhà thầu "${contractorName}" không thuộc dự án "${projectName}"`,
          });
          continue;
        }
      }

      const zoneNames = parseZoneNames(zonesRaw);
      const zoneIds: string[] = [];
      let zoneError: string | null = null;
      for (const zn of zoneNames) {
        const id = zoneByName.get(zn.toLowerCase());
        if (!id) {
          zoneError = `Không tìm thấy khu vực "${zn}"`;
          break;
        }
        zoneIds.push(id);
      }
      if (zoneError) {
        result.errors.push({ row: rowNumber, message: zoneError });
        continue;
      }

      try {
        // Match existing staff by email; employee code is always auto-generated on create
        const existingByEmail = await this.prisma.user.findFirst({
          where: {
            email: { equals: email, mode: 'insensitive' },
            isDeleted: false,
          },
          select: { id: true, employeeCode: true },
        });

        let userId: string;
        if (existingByEmail) {
          await this.prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              fullName,
              email,
              phone,
              userType,
              ...(citizenId ? { citizenId } : {}),
              ...(departmentId ? { departmentId } : {}),
              ...(contractorId ? { contractorId } : {}),
              ...(projectId ? { projectId } : {}),
            },
          });
          userId = existingByEmail.id;
          result.updated += 1;
        } else {
          const created = await this.create({
            fullName,
            email,
            phone,
            userType,
            ...(citizenId ? { citizenId } : {}),
            ...(departmentId ? { departmentId } : {}),
            ...(contractorId ? { contractorId } : {}),
            ...(projectId ? { projectId } : {}),
          });
          userId = created.id;
          result.created += 1;
        }

        // Face: cột Ảnh = tên file trong ZIP. Ô trống = bỏ qua FaceID.
        let faceBuf: Buffer | null = null;
        if (faceRaw) {
          if (isHttpUrl(faceRaw)) {
            result.errors.push({
              row: rowNumber,
              message: 'Không hỗ trợ URL ảnh. Ghi tên file trong ZIP vào cột Ảnh (vd. anh1.jpg)',
            });
            continue;
          }
          faceBuf = lookupZipImage(zipImages, faceRaw);
          if (!faceBuf) {
            result.errors.push({
              row: rowNumber,
              message: `Không tìm thấy ảnh "${faceRaw}" trong ZIP`,
            });
            continue;
          }
        }

        if (faceBuf) {
          try {
            await this.credentials.enrollFaceBuffer(userId, faceBuf);
            result.facesEnrolled += 1;
          } catch (err) {
            result.errors.push({
              row: rowNumber,
              message: `Ảnh FaceID: ${err instanceof Error ? err.message : 'lỗi'}`,
            });
            continue;
          }
        }

        if (zoneIds.length > 0) {
          await this.provision(userId, { zoneIds, autoSync: true });
          result.zonesAssigned += 1;
        }
      } catch (err) {
        const message =
          err instanceof ConflictException || err instanceof BadRequestException
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Lỗi không xác định';
        result.errors.push({ row: rowNumber, message });
      }
    }

    return result;
  }
}
