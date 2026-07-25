import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AkuvoxService } from '../devices/akuvox.service';
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
    private readonly credentials: CredentialsService,
  ) {}

  private buildWhere(query: { search?: string; departmentId?: string }) {
    return {
      isDeleted: false,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' as const } },
              { employeeCode: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  /** Attach a public URL for the face image stored on disk (path in PostgreSQL). */
  private async withFaceUrl<T extends { faceImagePath: string | null }>(user: T) {
    let faceImageUrl: string | null = null;
    if (user.faceImagePath) {
      try {
        faceImageUrl = await this.storage.getAssetUrl(user.faceImagePath);
      } catch {
        faceImageUrl = null;
      }
    }
    return { ...user, faceImageUrl };
  }

  async findAll(query: UsersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(query);

    const [rawItems, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { department: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = await Promise.all(rawItems.map((u) => this.withFaceUrl(u)));
    return { items, total, page, pageSize };
  }

  async findIds(query: UsersIdsQueryDto) {
    const where = this.buildWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { ids: rows.map((r) => r.id), total };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      include: { department: true, credentials: true },
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
          include: { department: true },
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

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      include: { department: true },
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
          const result = await this.akuvox.syncUserCredentials(userId, zone.id);
          syncByZone.push({
            zoneId: zone.id,
            zoneName: zone.name,
            synced: result.synced,
            devices: result.devices,
            results: result.results ?? [],
            mock: result.mock,
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
      employeeCode: 'NV-0001',
      fullName: 'Nguyễn Văn A',
      email: 'nguyenvana@example.com',
      phone: '0912345678',
      department: 'Phòng Nhân sự',
      userType: 'EMPLOYEE',
      faceImage: '',
      zones: 'Khu vực chính; Khu văn phòng',
    });
    // Instruction row note in column headers is enough; add a second sheet tip
    const tip = workbook.addWorksheet('Huong_dan');
    tip.getCell('A1').value =
      'Cột Ảnh: dán (Ctrl+V) ảnh vào ô, hoặc chèn ảnh vào dòng đó. Không dùng URL.';
    tip.getCell('A2').value =
      'Hoặc import file ZIP chứa Excel + ảnh JPG/PNG (cột Ảnh ghi tên file, vd. NV-0001.jpg).';
    tip.getCell('A3').value =
      'Cột Khu vực: nhiều khu vực, phân tách bằng dấu ; hoặc , (đúng tên khu vực trên hệ thống).';
    tip.getCell('A4').value = 'Phòng ban: chỉ 1 phòng ban / nhân viên.';
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
      const employeeCode = cell(row, 'employeeCode');
      const departmentName = cell(row, 'department');
      const userTypeRaw = cell(row, 'userType');
      const faceRaw = cell(row, 'faceImage');
      const zonesRaw = cell(row, 'zones');

      if (
        !fullName &&
        !email &&
        !phoneRaw &&
        !employeeCode &&
        !departmentName &&
        !faceRaw &&
        !zonesRaw
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
        const code = employeeCode.trim();
        const existingByCode = code
          ? await this.prisma.user.findFirst({
              where: { employeeCode: code, isDeleted: false },
            })
          : null;

        const emailOwner = await this.prisma.user.findFirst({
          where: {
            email: { equals: email, mode: 'insensitive' },
            isDeleted: false,
            ...(existingByCode ? { id: { not: existingByCode.id } } : {}),
          },
          select: { id: true, employeeCode: true },
        });
        if (emailOwner) {
          result.errors.push({
            row: rowNumber,
            message: `Email đã dùng bởi mã NV ${emailOwner.employeeCode}`,
          });
          continue;
        }

        let userId: string;
        if (existingByCode) {
          await this.prisma.user.update({
            where: { id: existingByCode.id },
            data: {
              fullName,
              email,
              phone,
              userType,
              ...(departmentId ? { departmentId } : {}),
            },
          });
          userId = existingByCode.id;
          result.updated += 1;
        } else {
          const created = await this.create({
            ...(code ? { employeeCode: code } : {}),
            fullName,
            email,
            phone,
            userType,
            ...(departmentId ? { departmentId } : {}),
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
