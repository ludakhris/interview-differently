import { Controller, UseGuards } from '@nestjs/common'
import { LearnGuard } from '../../auth/learn.guard'
import { ActivityService } from './activity.service'

/** #69: endpoints are listed in docs/talent-and-attendance-design.md. Add routes here. */
@Controller('learn')
@UseGuards(LearnGuard)
export class ActivityController {
  constructor(private readonly service: ActivityService) {}
}
