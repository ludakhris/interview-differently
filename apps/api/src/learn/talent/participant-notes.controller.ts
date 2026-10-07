import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { LearnGuard } from '../../auth/learn.guard'
import type { NoteInput, SupportItemInput } from '../talent-types'
import { ParticipantNotesService } from './participant-notes.service'

interface LearnRequest {
  userId: string
  userRole?: string
}

/**
 * #69 B: staff notes and support items. Staff of the provider only (checked in the service, first
 * thing). Nothing here is ever returned by a learner endpoint.
 */
@Controller('learn/providers/:providerId')
@UseGuards(LearnGuard)
export class ParticipantNotesController {
  constructor(private readonly service: ParticipantNotesService) {}

  private actor(req: LearnRequest) {
    return { userId: req.userId, role: req.userRole }
  }

  @Get('staff-members')
  staff(@Req() req: LearnRequest, @Param('providerId') providerId: string) {
    return this.service.staff(this.actor(req), providerId)
  }

  @Get('support-items')
  queue(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('dueBefore') dueBefore?: string
  ) {
    return this.service.queue(this.actor(req), providerId, { status, assigneeId, dueBefore })
  }

  @Get('participants/:userId/notes')
  listNotes(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string
  ) {
    return this.service.listNotes(this.actor(req), providerId, userId)
  }

  @Post('participants/:userId/notes')
  createNote(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string,
    @Body() body: NoteInput
  ) {
    return this.service.createNote(this.actor(req), providerId, userId, body)
  }

  @Put('participants/:userId/notes/:noteId')
  updateNote(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string,
    @Param('noteId') noteId: string,
    @Body() body: { body: string }
  ) {
    return this.service.updateNote(this.actor(req), providerId, userId, noteId, body)
  }

  @Delete('participants/:userId/notes/:noteId')
  deleteNote(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string,
    @Param('noteId') noteId: string
  ) {
    return this.service.deleteNote(this.actor(req), providerId, userId, noteId)
  }

  @Get('participants/:userId/support-items')
  listItems(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string
  ) {
    return this.service.listItems(this.actor(req), providerId, userId)
  }

  @Post('participants/:userId/support-items')
  createItem(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string,
    @Body() body: SupportItemInput
  ) {
    return this.service.createItem(this.actor(req), providerId, userId, body)
  }

  @Put('participants/:userId/support-items/:itemId')
  updateItem(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string,
    @Param('itemId') itemId: string,
    @Body() body: Partial<SupportItemInput>
  ) {
    return this.service.updateItem(this.actor(req), providerId, userId, itemId, body)
  }

  @Delete('participants/:userId/support-items/:itemId')
  deleteItem(
    @Req() req: LearnRequest,
    @Param('providerId') providerId: string,
    @Param('userId') userId: string,
    @Param('itemId') itemId: string
  ) {
    return this.service.deleteItem(this.actor(req), providerId, userId, itemId)
  }
}
