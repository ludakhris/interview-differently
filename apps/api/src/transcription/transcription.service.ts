import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { Readable } from 'stream'
import { toFile } from 'openai'

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name)
  private readonly client = new OpenAI()

  /**
   * Transcribe an audio buffer using OpenAI Whisper.
   * Returns null (never throws) so a transcription failure never blocks response submission.
   */
  async transcribe(buffer: Buffer, filename = 'response.webm'): Promise<string | null> {
    this.logger.log(`Transcribing ${filename}, buffer size: ${buffer.length} bytes`)
    try {
      const file = await toFile(Readable.from(buffer), filename, { type: 'audio/webm' })
      const result = await this.client.audio.transcriptions.create({
        model: 'whisper-1',
        file,
      })
      this.logger.log(`Transcription result: "${result.text}"`)
      return result.text ?? null
    } catch (err) {
      this.logger.error('Whisper transcription failed', err instanceof Error ? err.stack : err)
      return null
    }
  }
}
