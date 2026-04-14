import { Injectable, Logger } from '@nestjs/common'

const DID_BASE_URL = 'https://api.d-id.com'

// Curated presenters — names that render well with D-ID's streaming model.
// Any presenter not in this list is excluded from random selection.
const CURATED_PRESENTER_NAMES = new Set([
  'Amy', 'Noelle', 'Amber', 'Natasha',   // female
  'William', 'Ryan', 'Davis', 'Marcus',   // male
])

interface DIdPresenter {
  presenter_id?: string
  id?: string
  name: string
  gender: string
  image_url?: string
  preview_url?: string
  thumbnail_url?: string
}

export interface CuratedPresenter {
  id: string
  name: string
  gender: 'male' | 'female'
  image_url: string
}

@Injectable()
export class DidService {
  private readonly logger = new Logger(DidService.name)
  private readonly authHeader: string

  constructor() {
    const apiKey = process.env.DID_API_KEY
    if (!apiKey) throw new Error('DID_API_KEY is not set')
    this.authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${DID_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      },
    })
    if (!res.ok) {
      const body = await res.text()
      this.logger.error(`D-ID API ${res.status} on ${options.method ?? 'GET'} ${path}: ${body}`)
      throw new Error(`D-ID API ${res.status}: ${body}`)
    }
    return res.json() as Promise<T>
  }

  /** Returns curated stock presenters from D-ID's clips library, filtered to known-good names. */
  async getPresenters(): Promise<CuratedPresenter[]> {
    const data = await this.request<{ presenters?: DIdPresenter[] }>('/clips/presenters')
    const all: DIdPresenter[] = data.presenters ?? []
    return all
      .filter(p => CURATED_PRESENTER_NAMES.has(p.name))
      .filter(p => !(p.presenter_id ?? p.id ?? '').includes('GreenScreen'))
      .map(p => ({
        id: p.presenter_id ?? p.id ?? '',
        name: p.name,
        gender: (p.gender === 'male' ? 'male' : 'female') as 'male' | 'female',
        image_url: p.image_url ?? p.preview_url ?? p.thumbnail_url ?? '',
      }))
      .filter(p => p.image_url !== '')
  }

  /** Create a new WebRTC streaming session using D-ID's lively (v4) animation driver. */
  async createStream(sourceUrl: string): Promise<{
    id: string
    session_id: string
    offer: RTCSessionDescriptionInit
    ice_servers: RTCIceServer[]
  }> {
    return this.request('/talks/streams', {
      method: 'POST',
      body: JSON.stringify({
        source_url: sourceUrl,
        config: { stitch: true, fluent: true },
      }),
    })
  }

  /** Forward the browser's WebRTC answer SDP to D-ID. */
  async sendAnswer(
    streamId: string,
    answer: RTCSessionDescriptionInit,
    sessionId: string,
  ): Promise<unknown> {
    return this.request(`/talks/streams/${streamId}/sdp`, {
      method: 'POST',
      body: JSON.stringify({ answer, session_id: sessionId }),
    })
  }

  /** Forward a browser ICE candidate to D-ID. */
  async sendIceCandidate(
    streamId: string,
    candidate: string,
    sdpMid: string,
    sdpMLineIndex: number,
    sessionId: string,
  ): Promise<unknown> {
    return this.request(`/talks/streams/${streamId}/ice`, {
      method: 'POST',
      body: JSON.stringify({ candidate, sdpMid, sdpMLineIndex, session_id: sessionId }),
    })
  }

  /** Send text for the avatar to speak. Uses Microsoft Azure TTS via D-ID. */
  async sendTalk(streamId: string, text: string, voiceId: string, sessionId: string): Promise<unknown> {
    return this.request(`/talks/streams/${streamId}`, {
      method: 'POST',
      body: JSON.stringify({
        script: {
          type: 'text',
          input: text,
          provider: { type: 'microsoft', voice_id: voiceId },
        },
        config: { stitch: true, fluent: true },
        session_id: sessionId,
      }),
    })
  }

  /** Close and clean up the streaming session. */
  async closeStream(streamId: string, sessionId: string): Promise<unknown> {
    return this.request(`/talks/streams/${streamId}`, {
      method: 'DELETE',
      body: JSON.stringify({ session_id: sessionId }),
    })
  }
}
