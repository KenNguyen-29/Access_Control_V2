import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { IntegrationController } from './integration.controller';

@Module({
  imports: [WebhooksModule, HealthModule, SystemSettingsModule],
  controllers: [IntegrationController],
})
export class IntegrationModule {}
