import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PlatformScope } from '../auth/decorators/platform-scope.decorator';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { UsageService } from './usage.service';

/** How the product is used, for the people who run the platform. */
@PlatformScope()
@Controller('admin/usage')
@UseGuards(SuperAdminGuard)
export class AdminUsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  view(@Query('range') range?: string) {
    return this.usage.view(range === '90' ? 90 : 30);
  }
}
