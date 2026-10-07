import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import { LearnGuard } from '../../auth/learn.guard'
import { AttendanceService } from './attendance.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** #69 D. Endpoints: docs/talent-and-attendance-design.md section 6D. */
@Controller('learn')
@UseGuards(LearnGuard)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get('cohorts/:cohortId/sessions')
  list(@Req() req: LearnRequest, @Param('cohortId') cohortId: string) {
    return this.service.listSessions(req.userId, req.userRole, cohortId)
  }

  @Post('cohorts/:cohortId/sessions')
  create(@Req() req: LearnRequest, @Param('cohortId') cohortId: string, @Body() body: unknown) {
    return this.service.createSession(req.userId, req.userRole, cohortId, body)
  }

  @Put('cohorts/:cohortId/sessions/:sessionId')
  update(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown
  ) {
    return this.service.updateSession(req.userId, req.userRole, cohortId, sessionId, body)
  }

  @Delete('cohorts/:cohortId/sessions/:sessionId')
  remove(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('sessionId') sessionId: string
  ) {
    return this.service.deleteSession(req.userId, req.userRole, cohortId, sessionId)
  }

  @Get('cohorts/:cohortId/sessions/:sessionId/marks')
  sheet(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('sessionId') sessionId: string
  ) {
    return this.service.sheet(req.userId, req.userRole, cohortId, sessionId)
  }

  @Put('cohorts/:cohortId/sessions/:sessionId/marks')
  saveMarks(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown
  ) {
    return this.service.saveMarks(req.userId, req.userRole, cohortId, sessionId, body)
  }

  @Get('cohorts/:cohortId/attendance')
  summary(@Req() req: LearnRequest, @Param('cohortId') cohortId: string) {
    return this.service.summary(req.userId, req.userRole, cohortId)
  }

  @Get('cohorts/:cohortId/attendance.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="attendance.csv"')
  csv(@Req() req: LearnRequest, @Param('cohortId') cohortId: string) {
    return this.service.csv(req.userId, req.userRole, cohortId)
  }

  @Get('cohorts/:cohortId/sessions/:sessionId/attendance.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="session-attendance.csv"')
  sessionCsv(
    @Req() req: LearnRequest,
    @Param('cohortId') cohortId: string,
    @Param('sessionId') sessionId: string
  ) {
    return this.service.sessionCsv(req.userId, req.userRole, cohortId, sessionId)
  }

  /** The signed-in learner's own attendance: their marks only, never the staff note. */
  @Get('me/cohorts/:cohortId/attendance')
  mine(@Req() req: LearnRequest, @Param('cohortId') cohortId: string) {
    return this.service.mine(req.userId, cohortId)
  }
}
