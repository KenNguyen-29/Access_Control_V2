import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { RolesModule } from './modules/roles/roles.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { DevicesModule } from './modules/devices/devices.module';
import { DeviceMappingsModule } from './modules/device-mappings/device-mappings.module';
import { CredentialsModule } from './modules/credentials/credentials.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { StatsModule } from './modules/stats/stats.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueueModule } from './modules/queue/queue.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { AccessZonesModule } from './modules/access-zones/access-zones.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';
import { EmergencyModule } from './modules/emergency/emergency.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { RetentionModule } from './modules/retention/retention.module';
import { BackupModule } from './modules/backup/backup.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { isRedisEnabled } from './common/utils/redis.util';

const redisModules = isRedisEnabled()
  ? [
      BullModule.forRoot({
        connection: {
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
      }),
    ]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ScheduleModule.forRoot(),
    ...redisModules,
    PrismaModule,
    StorageModule,
    QueueModule,
    EventsModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    RolesModule,
    ShiftsModule,
    DevicesModule,
    DeviceMappingsModule,
    CredentialsModule,
    WebhooksModule,
    AttendanceModule,
    StatsModule,
    HealthModule,
    AccessZonesModule,
    PermissionsModule,
    SystemSettingsModule,
    EmergencyModule,
    AuditLogsModule,
    RetentionModule,
    BackupModule,
    IntegrationModule,
  ],
})
export class AppModule {}
