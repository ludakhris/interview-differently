import { stillAsked } from './practice-port'

describe('stillAsked', () => {
  const refs = ['1.1', '1.2', '4.1', '4.2']
  const groups = [
    ['1.1', '1.2'],
    ['4.1', '4.2'],
  ]

  it('asks everything without groups, or before any miss', () => {
    expect(stillAsked(refs, undefined, { '1.1': { correct: false } })).toEqual(refs)
    expect(stillAsked(refs, groups, { '1.1': { correct: true } })).toEqual(refs)
  })

  it('stops a group after a miss or a pass, keeping what was answered', () => {
    expect(stillAsked(refs, groups, { '4.1': { correct: false } })).toEqual(['1.1', '1.2', '4.1'])
    expect(
      stillAsked(refs, groups, { '4.1': { correct: false }, '4.2': { correct: true } })
    ).toEqual(refs)
  })
})
