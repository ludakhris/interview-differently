import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { LearnGuard } from '../auth/learn.guard'
import { CoursesService } from './courses.service'
import { ItemImageService } from './item-image.service'
import { MAX_IMAGE_BYTES } from './item-image'

interface LearnRequest {
  userId: string
  userRole?: string
}

/** Upload or remove the preview image of an external course item. */
@Controller('learn/items/:id/image')
@UseGuards(LearnGuard)
export class ItemImageController {
  constructor(
    private readonly courses: CoursesService,
    private readonly images: ItemImageService
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  async upload(
    @Req() req: LearnRequest,
    @Param('id') itemId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose an image to upload')
    await this.courses.assertItemAccess(req.userId, req.userRole, itemId)
    const key = await this.images.store(file.buffer)
    return this.courses.setItemImage(req.userId, req.userRole, itemId, key)
  }

  @Delete()
  remove(@Req() req: LearnRequest, @Param('id') itemId: string) {
    return this.courses.setItemImage(req.userId, req.userRole, itemId, null)
  }
}
