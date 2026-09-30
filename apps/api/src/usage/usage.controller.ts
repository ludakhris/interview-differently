import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../auth/admin.guard'
import { USAGE_RANGES, type UsageRange } from './usage.aggregate'
import { UsageService } from './usage.service'

/**
 * Platform-wide usage dashboard (#42). Full admins only — deliberately no
 * @InstitutionAdminAllowed(): it spans every institution.
 */
@Controller('admin/usage')
@UseGuards(AdminGuard)
export class UsageController {
  constructor(private readonly service: UsageService) {}

  @Get()
  get(
    @Query('range') range = '30d',
    @Query('includeAdmins') includeAdmins?: string,
    @Query('tz') tz?: string
  ) {
    if (!(USAGE_RANGES as string[]).includes(range)) {
      throw new BadRequestException(`range must be one of ${USAGE_RANGES.join(', ')}`)
    }
    const tzOffsetMinutes = Number(tz ?? 0)
    if (!Number.isFinite(tzOffsetMinutes) || Math.abs(tzOffsetMinutes) > 14 * 60) {
      throw new BadRequestException('tz must be a UTC offset in minutes')
    }
    return this.service.report({
      range: range as UsageRange,
      includeAdmins: includeAdmins === 'true',
      tzOffsetMinutes,
    })
  }
}
