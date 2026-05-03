import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { ScenarioMediaService } from './scenario-media.service'
import { LocalDiskMediaStorage } from './storage/local-disk-storage'

@Controller('scenario-media')
export class ScenarioMediaController {
  constructor(
    private readonly service: ScenarioMediaService,
    // Optional — only present when local-disk storage is in use; serves the file route below.
    private readonly localStorage: LocalDiskMediaStorage,
  ) {}

  @Get(':scenarioId')
  async list(@Param('scenarioId') scenarioId: string) {
    return this.service.listForScenario(scenarioId)
  }

  @Post('render/:scenarioId/:nodeId')
  @HttpCode(200)
  async renderNode(
    @Param('scenarioId') scenarioId: string,
    @Param('nodeId') nodeId: string,
  ) {
    try {
      return await this.service.renderNode(scenarioId, nodeId)
    } catch (err) {
      if (err instanceof HttpException) throw err
      const msg = err instanceof Error ? err.message : 'Render failed'
      throw new HttpException(msg, HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Delete(':scenarioId/:nodeId')
  @HttpCode(204)
  async deleteAsset(
    @Param('scenarioId') scenarioId: string,
    @Param('nodeId') nodeId: string,
  ) {
    await this.service.deleteAsset(scenarioId, nodeId)
  }

  /**
   * Serves files written by LocalDiskMediaStorage. Only used in dev — in production
   * R2 hosts the MP4s directly and this route is unused.
   * Wildcard splat: /files/scenarios/abc/node1-abcdef.mp4 → key = "scenarios/abc/node1-abcdef.mp4".
   */
  @Get('files/*')
  async serveFile(
    @Param('0') key: string,
    @Res() res: Response,
  ) {
    const buf = await this.localStorage.read(key)
    if (!buf) throw new NotFoundException(`Media not found: ${key}`)
    res.set('Content-Type', 'video/mp4')
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.send(buf)
  }
}
