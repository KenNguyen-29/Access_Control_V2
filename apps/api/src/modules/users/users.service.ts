import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
import { UsersIdsQueryDto, UsersQueryDto } from './dto/users-query.dto';
import {
  basenamePath,
  cellToString,
  createUsersWorkbook,
  isHttpUrl,
  isValidImportEmail,
  isValidImportPhone,
  mapEmbeddedImagesByRow,
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

  private async nextEmployeeCode() {
    const prefix = (this.config.get<string>('EMPLOYEE_CODE_PREFIX', 'NV') || 'NV').trim();
    const codePrefix = `${prefix}-`;
    const last = await this.prisma.user.findFirst({
      where: {
        employeeCode: {
          startsWith: codePrefix,
        },
      },
      select: { employeeCode: true },
      orderBy: { employeeCode: 'desc' },
    });
    const current = last?.employeeCode ?? '';
    const match = current.match(new RegExp(`^${prefix}-(\\d+)$`));
    const next = Number(match?.[1] ?? '0') + 1;
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }

  async create(dto: CreateUserDto) {
    this.assertContractorRequired(dto.userType, dto.contractorId);
    await this.assertProjectContractorMatch(dto.projectId, dto.contractorId);
    const trimmedCode = dto.employeeCode?.trim();
    const baseData = {
      ...dto,
      employeeCode: trimmedCode || undefined,
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const user = await this.prisma.user.create({
          data: {
            ...baseData,
            employeeCode: baseData.employeeCode || (await this.nextEmployeeCode()),
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
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { isDeleted: true },
    });
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
      faceImage: '',
      zones: 'Khu vực chính; Khu văn phòng',
    });
    // Instruction row note in column headers is enough; add a second sheet tip
    const tip = workbook.addWorksheet('Huong_dan');
    tip.getCell('A1').value =
      'Mã nhân viên được hệ thống tự sinh (không cần cột Mã NV). Cập nhật nhân viên cũ theo Email.';
    tip.getCell('A2').value =
      'Cột Ảnh: dán (Ctrl+V) ảnh vào ô, hoặc chèn ảnh vào dòng đó. Không dùng URL.';
    tip.getCell('A3').value =
      'Hoặc import file ZIP chứa Excel + ảnh JPG/PNG (cột Ảnh ghi tên file, vd. anh1.jpg).';
    tip.getCell('A4').value =
      'Cột Khu vực: nhiều khu vực, phân tách bằng dấu ; hoặc , (đúng tên khu vực trên hệ thống).';
    tip.getCell('A5').value =
      'Phòng ban / Nhà thầu / Dự án: ghi đúng tên hoặc mã đã tạo trên hệ thống. CCCD tùy chọn.';
    tip.getColumn(1).width = 110;
    return workbookToBuffer(workbook);
  }

  /** Accept raw .xlsx or .zip (xlsx + jpg files). */
  async importFromUpload(file: Express.Multer.File): Promise<UsersImportResult> {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.zip')) {
      return this.importFromZipBuffer(file.buffer);
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      return this.importFromExcelBuffer(file.buffer, new Map());
    }
    throw new BadRequestException('Chỉ hỗ trợ file Excel (.xlsx) hoặc ZIP (Excel + ảnh JPG)');
  }

  private async importFromZipBuffer(buffer: Buffer): Promise<UsersImportResult> {
    const zip = await JSZip.loadAsync(buffer);
    const imageFiles = new Map<string, Buffer>();
    let xlsxBuf: Buffer | null = null;

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const lower = path.toLowerCase();
      const base = basenamePath(path).toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        if (!xlsxBuf) xlsxBuf = Buffer.from(await entry.async('nodebuffer'));
        continue;
      }
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) {
        const data = Buffer.from(await entry.async('nodebuffer'));
        imageFiles.set(base, data);
        // also key by relative path without leading folders for flexibility
        imageFiles.set(path.replace(/\\/g, '/').toLowerCase(), data);
      }
    }

    if (!xlsxBuf) {
      throw new BadRequestException('ZIP phải chứa một file Excel (.xlsx)');
    }
    return this.importFromExcelBuffer(xlsxBuf, imageFiles);
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

    const embeddedByRow = mapEmbeddedImagesByRow(workbook, sheet, headerMap.faceImage);

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

        // Face image: ảnh dán/chèn trong Excel (ưu tiên) hoặc tên file trong ZIP — không dùng URL
        let faceBuf = embeddedByRow.get(rowNumber) ?? null;
        if (!faceBuf && faceRaw) {
          if (isHttpUrl(faceRaw)) {
            result.errors.push({
              row: rowNumber,
              message:
                'Không hỗ trợ URL ảnh. Hãy dán/chèn ảnh vào cột Ảnh, hoặc import ZIP kèm file ảnh',
            });
            continue;
          }
          const base = basenamePath(faceRaw).toLowerCase();
          faceBuf =
            zipImages.get(base) ??
            zipImages.get(faceRaw.trim().replace(/\\/g, '/').toLowerCase()) ??
            null;
          if (!faceBuf && zipImages.size > 0) {
            result.errors.push({
              row: rowNumber,
              message: `Không tìm thấy ảnh "${faceRaw}" trong ZIP`,
            });
            continue;
          }
          if (!faceBuf && zipImages.size === 0) {
            result.errors.push({
              row: rowNumber,
              message:
                'Không có ảnh nhúng trên dòng này. Dán ảnh vào ô cột Ảnh, hoặc dùng ZIP (Excel + file ảnh)',
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
