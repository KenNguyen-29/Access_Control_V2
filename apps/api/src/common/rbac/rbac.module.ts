import { Global, Module } from '@nestjs/common';
import { ProjectScopeService } from '../services/project-scope.service';
import { RolesGuard } from '../guards/roles.guard';

@Global()
@Module({
  providers: [ProjectScopeService, RolesGuard],
  exports: [ProjectScopeService, RolesGuard],
})
export class RbacModule {}
