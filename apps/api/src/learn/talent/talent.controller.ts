import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { LearnGuard } from '../../auth/learn.guard'
import { MAX_RESUME_BYTES } from './resume'
import { TalentService, type ParticipantFilters } from './talent.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

const flag = (v: string | undefined): boolean | undefined => (v === 'true' ? true : undefined)

function filtersOf(q: Record<string, string | undefined>): ParticipantFilters {
  const years = q.minYears !== undefined && q.minYears !== '' ? Number(q.minYears) : undefined
  return {
    q: q.q,
    cohortId: q.cohortId || undefined,
    industry: q.industry || undefined,
    role: q.role || undefined,
    educationLevel: q.educationLevel || undefined,
    share: flag(q.share),
    completed: flag(q.completed),
    hasResume: flag(q.hasResume),
    minYears: years !== undefined && Number.isFinite(years) ? years : undefined,
  }
}

/** The talent profile (#69 C). The learner's own routes first, then the provider staff's. */
@Controller('learn')
@UseGuards(LearnGuard)
export class TalentController {
  constructor(private readonly service: TalentService) {}

  // ── the learner's own profile ─────────────────────────────────────────────

  @Get('me/talent-profiles')
  @Header('Cache-Control', 'no-store')
  mine(@Req() req: LearnRequest) {
    return this.service.myProfiles(req.userId)
  }

  @Put('me/talent-profiles/:providerId')
  @Header('Cache-Control', 'no-store')
  save(@Req() req: LearnRequest, @Param('providerId') providerId: string, @Body() body: unknown) {
    return this.service.saveProfile(req.userId, providerId, body)
  }

  @Post('me/talent-profiles/:providerId/resume')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RESUME_BYTES } }))
  uploadResume(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer } | undefined
  ) {
    return this.service.uploadResume(req.userId, providerId, file)
  }

  @Get('me/talent-profiles/:providerId/resume')
  @Header('Cache-Control', 'no-store')
  myResume(@Req() req: LearnRequest, @Param('providerId') providerId: string) {
    return this.service.myResumeLink(req.userId, providerId)
  }

  @Delete('me/talent-profiles/:providerId/resume')
  removeResume(@Req() req: LearnRequest, @Param('providerId') providerId: string) {
    return this.service.deleteResume(req.userId, providerId)
  }

  // ── provider staff ────────────────────────────────────────────────────────

  @Get('providers/:providerId/participants')
  @Header('Cache-Control', 'no-store')
  participants(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.service.searchParticipants(
      { userId: req.userId, role: req.userRole },
      providerId,
      filtersOf(query)
    )
  }

  @Get('providers/:providerId/participants/:userId')
  @Header('Cache-Control', 'no-store')
  header(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string
  ) {
    return this.service.participantHeader(
      { userId: req.userId, role: req.userRole },
      providerId,
      userId
    )
  }

  @Get('providers/:providerId/participants/:userId/profile')
  @Header('Cache-Control', 'no-store')
  async staffProfile(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string,
    @Res() res: Response
  ) {
    const profile = await this.service.staffProfile(
      { userId: req.userId, role: req.userRole },
      providerId,
      userId
    )
    // A participant with no profile yet is a literal `null`; Nest would send an empty body for it.
    res.json(profile)
  }

  @Get('providers/:providerId/participants/:userId/compensation')
  @Header('Cache-Control', 'no-store')
  staffCompensation(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string
  ) {
    return this.service.staffCompensation(
      { userId: req.userId, role: req.userRole },
      providerId,
      userId
    )
  }

  @Get('providers/:providerId/participants/:userId/resume')
  @Header('Cache-Control', 'no-store')
  staffResume(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string
  ) {
    return this.service.staffResumeLink(
      { userId: req.userId, role: req.userRole },
      providerId,
      userId
    )
  }

  @Get('providers/:providerId/talent-export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="talent.csv"')
  @Header('Cache-Control', 'no-store')
  exportCsv(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.service.exportCsv(
      { userId: req.userId, role: req.userRole },
      providerId,
      filtersOf(query),
      query.includeCompensation === 'true'
    )
  }
}
