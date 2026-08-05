import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CredentialType, DeviceSyncStatus } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AkuvoxService } from '../devices/akuvox.service';
import { CreateCredentialDto } from './dto/create-credential.dto';

const MAX_FACE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly akuvox: AkuvoxService,
  ) {}

  findByUser(userId: string) {
    return this.prisma.credential.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAll(status?: 'active' | 'revoked') {
    return this.prisma.credential.findMany({
      where: {
        isDeleted: false,
        ...(status === 'active' ? { isActive: true } : {}),
        ...(status === 'revoked' ? { isActive: false } : {}),
      },
      include: {
        user: {
          select: { id: true, fullName: true, employeeCode: true, departmentId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: CreateCredentialDto) {
    return this.prisma.credential.create({ data: dto });
  }

  async revoke(id: string) {
    const item = await this.prisma.credential.findFirst({
      where: { id, isDeleted: false },
    });
    if (!item) throw new NotFoundException('Credential not found');
    return this.prisma.credential.update({
      where: { id },
      data: { isActive: false, syncStatus: DeviceSyncStatus.PENDING },
    });
  }

  async remove(id: string) {
    return this.prisma.credential.update({
      where: { id },
      data: { isDeleted: true, isActive: false },
    });
  }

  async enrollFace(userId: string, file: Express.Multer.File) {
    return this.enrollFaceBuffer(userId, file?.buffer, file?.mimetype);
  }

  /** Enroll face from an in-memory image buffer (import Excel paste / ZIP). Converts to JPEG. */
  async enrollFaceBuffer(
    userId: string,
    buffer: Buffer | undefined,
    _mimeHint?: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!buffer?.length) {
      throw new BadRequestException('Vui lòng chọn ảnh khuôn mặt');
    }
    if (buffer.length < 100) {
      throw new BadRequestException('Ảnh khuôn mặt không hợp lệ');
    }
    if (buffer.length > MAX_FACE_BYTES) {
      throw new BadRequestException('Ảnh khuôn mặt vượt quá 10MB');
    }

    let jpeg: Buffer;
    try {
      jpeg = await sharp(buffer)
        .rotate()
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch (err) {
      const msg = (err as Error).message || String(err);
      this.logger.warn(`face enroll sharp failed user=${userId}: ${msg}`);
      // FE already compresses to JPEG; if sharp native addon fails (e.g. Alpine), keep valid JPEG as-is.
      const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      if (isJpeg) {
        this.logger.warn(`face enroll fallback: saving original JPEG without sharp (${buffer.length} bytes)`);
        jpeg = buffer;
      } else {
        throw new BadRequestException('Không đọc được ảnh (dùng file JPG/PNG)');
      }
    }

    const key = `face-images/${user.employeeCode || user.id}.jpg`;
    this.storage.saveToDisk(key, jpeg);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { faceImagePath: key },
    });

    await this.prisma.credential.updateMany({
      where: { userId: user.id, type: CredentialType.FACE, isDeleted: false },
      data: { isActive: false },
    });
    const credential = await this.prisma.credential.create({
      data: {
        userId: user.id,
        type: CredentialType.FACE,
        externalId: user.employeeCode,
        isActive: true,
        syncStatus: DeviceSyncStatus.PENDING,
      },
    });

    const photoUrl = this.storage.getFileUrl(key);

    const zoneCount = await this.prisma.userAccessPermission.count({
      where: { userId: user.id, isDeleted: false },
    });
    if (zoneCount > 0) {
      void this.akuvox.syncUserCredentials(user.id).catch((err) => {
        this.logger.warn(
          `Auto Akuvox sync after face enroll failed for user=${user.id}: ${(err as Error).message}`,
        );
      });
    } else {
      this.logger.log(
        `Skip auto Akuvox sync after face enroll user=${user.id} (no zone yet; provision will sync)`,
      );
    }

    return { credential, faceImagePath: key, photoUrl };
  }
}
