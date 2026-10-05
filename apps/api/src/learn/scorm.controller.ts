import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { LearnGuard } from '../auth/learn.guard'
import { CoursesService } from './courses.service'
import { ScormService } from './scorm.service'

interface LearnRequest {
  userId: string
  userRole?: string
  body: { title?: string }
}

const MAX_UPLOAD = 100 * 1024 * 1024

/** Upload a SCORM package into a module. The zip is checked before anything is stored. */
@Controller('learn')
@UseGuards(LearnGuard)
export class ScormController {
  constructor(
    private readonly courses: CoursesService,
    private readonly scorm: ScormService
  ) {}

  @Post('modules/:id/scorm')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD } }))
  async upload(
    @Req() req: LearnRequest,
    @Param('id') moduleId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a .zip file to upload')
    await this.courses.assertModuleAccess(req.userId, req.userRole, moduleId)
    const pkg = await this.scorm.store(file.buffer)
    const title = (req.body?.title ?? '').trim() || pkg.title || 'SCORM package'
    return this.courses.addScormItem(req.userId, req.userRole, moduleId, title, {
      packageId: pkg.packageId,
      entry: pkg.entry,
      version: pkg.version,
      files: pkg.files,
    })
  }
}

/**
 * Dev only: serves stored package files. In production /scorm/* is rewritten to
 * the R2 bucket, so this finds nothing there. Public like the bucket is: the
 * package id is an unguessable uuid.
 */
@Controller('scorm-files')
export class ScormFilesController {
  constructor(private readonly scorm: ScormService) {}

  @Get(':packageId/*')
  async file(
    @Param('packageId') packageId: string,
    @Param('0') path: string,
    @Res() res: Response
  ) {
    const found = await this.scorm.read(packageId, path)
    if (!found) throw new NotFoundException('Not found')
    res.set('Content-Type', found.type)
    res.set('Cache-Control', 'public, max-age=300')
    res.send(found.bytes)
  }
}
