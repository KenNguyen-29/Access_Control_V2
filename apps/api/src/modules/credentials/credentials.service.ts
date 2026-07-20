import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CredentialType, DeviceSyncStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AkuvoxService } from '../devices/akuvox.service';
import { CreateCredentialDto } from './dto/create-credential.dto';

const FACE_JPEG_MIME = new Set(['image/jpeg', 'image/jpg']);
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
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!file?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn ảnh khuôn mặt');
    }
    if (!FACE_JPEG_MIME.has(file.mimetype)) {
      throw new BadRequestException('Chỉ hỗ trợ ảnh JPG/JPEG');
    }
    if (file.buffer.length < 100) {
      throw new BadRequestException('Ảnh khuôn mặt không hợp lệ');
    }
    if (file.buffer.length > MAX_FACE_BYTES) {
      throw new BadRequestException('Ảnh khuôn mặt vượt quá 10MB');
    }

    const key = `face-images/${user.employeeCode || user.id}.jpg`;

    // JPG trên ổ cứng; PostgreSQL chỉ lưu đường dẫn tương đối
    this.storage.saveToDisk(key, file.buffer);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { faceImagePath: key },
    });

    // Deactivate previous FACE credentials, then create a fresh one pending sync
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

    void this.akuvox.syncUserCredentials(user.id).catch((err) => {
      this.logger.warn(
        `Auto Akuvox sync after face enroll failed for user=${user.id}: ${(err as Error).message}`,
      );
    });

    return { credential, faceImagePath: key, photoUrl };
  }
}
