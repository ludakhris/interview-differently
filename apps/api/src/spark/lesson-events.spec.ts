import { hasFinished, parseEventInput, watchedSummary } from './lesson-events'

const ev = (event: string, data: object = {}) => ({ event, data })

describe('watchedSummary', () => {
  it('is null when the lesson was never opened', () => {
    expect(watchedSummary([], 6)).toBeNull()
  })

  it('names every scene and the voice when the learner watched it all', () => {
    const events = [
      ev('start', { scene: 0, voice: 'server' }),
      ...[0, 1, 2, 3, 4, 5].map((scene) => ev('scene', { scene, voice: 'server' })),
      ev('finish', { scene: 5, voice: 'server' }),
    ]
    expect(watchedSummary(events, 6)).toBe('all 6 scenes · Mac voice')
    expect(hasFinished(events, 6)).toBe(true)
  })

  it('counts distinct scenes, the last voice used, and replays', () => {
    const events = [
      ev('start', { voice: 'browser' }),
      ev('scene', { scene: 0, voice: 'browser' }),
      ev('scene', { scene: 1, voice: 'browser' }),
      ev('replay', { scene: 0, voice: 'browser' }),
      ev('scene', { scene: 0, voice: 'browser' }),
    ]
    expect(watchedSummary(events, 6)).toBe('2 of 6 scenes · browser voice · replayed')
    expect(hasFinished(events, 6)).toBe(false)
  })

  it('says when the lesson was opened but no scene played', () => {
    expect(watchedSummary([ev('start')], 4)).toBe('opened, no scenes played')
  })
})

describe('hasFinished', () => {
  const scenes = (...n: number[]) => n.map((scene) => ev('scene', { scene }))

  it('needs every scene reached and a finish', () => {
    expect(hasFinished([...scenes(0, 1, 2), ev('finish', { scene: 2 })], 3)).toBe(true)
    // scenes out of order, repeated, or across a replay still cover the lesson
    expect(hasFinished([...scenes(0, 1), ev('replay'), ...scenes(0, 2, 2), ev('finish')], 3)).toBe(
      true
    )
  })

  it('is not finished on a finish event alone, a skipped scene, or every scene with no finish', () => {
    expect(hasFinished([ev('finish', { scene: 2 })], 3)).toBe(false)
    expect(hasFinished([ev('start'), ...scenes(0, 2), ev('finish', { scene: 2 })], 3)).toBe(false)
    expect(hasFinished(scenes(0, 1, 2), 3)).toBe(false)
    // a start says nothing about scene 0
    expect(hasFinished([ev('start', { scene: 0 }), ...scenes(1, 2), ev('finish')], 3)).toBe(false)
  })
})

describe('parseEventInput', () => {
  it('keeps the scene and voice the player sends', () => {
    expect(parseEventInput({ event: 'scene', scene: 2, voice: 'server' }, 6)).toEqual({
      event: 'scene',
      data: { scene: 2, voice: 'server' },
    })
    expect(parseEventInput({ event: 'start' }, 6)).toEqual({ event: 'start', data: {} })
  })

  it('refuses unknown events, scenes out of range and unknown voices', () => {
    expect(parseEventInput({ event: 'complete' }, 6)).toBeNull()
    expect(parseEventInput({ event: 'scene', scene: 6 }, 6)).toBeNull()
    expect(parseEventInput({ event: 'scene', scene: 1.5 }, 6)).toBeNull()
    expect(parseEventInput({ event: 'scene', voice: 'robot' }, 6)).toBeNull()
    expect(parseEventInput(null, 6)).toBeNull()
  })
})
