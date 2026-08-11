import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { ContractorReportsController } from './contractor-reports.controller';
import { ContractorReportsService } from './contractor-reports.service';

@Module({
  imports: [HttpModule, SystemSettingsModule],
  controllers: [ContractorReportsController],
  providers: [ContractorReportsService],
  exports: [ContractorReportsService],
})
export class ContractorReportsModule {}
