import { parseYouTube } from './youtube'

const ID = 'dQw4w9WgXcQ'

describe('parseYouTube', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&list=PL123`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=abc`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`  https://youtu.be/${ID}  `],
    [ID],
  ])('accepts %s', (input) => {
    expect(parseYouTube(input)?.videoId).toBe(ID)
  })

  it.each([
    ['plain http', `http://www.youtube.com/watch?v=${ID}`],
    ['javascript scheme', `javascript:alert(1)//youtube.com/watch?v=${ID}`],
    ['lookalike host', `https://youtube.com.evil.com/watch?v=${ID}`],
    ['lookalike suffix', `https://evilyoutube.com/watch?v=${ID}`],
    ['other site', `https://vimeo.com/watch?v=${ID}`],
    ['userinfo', `https://user:pw@www.youtube.com/watch?v=${ID}`],
    ['custom port', `https://www.youtube.com:8443/watch?v=${ID}`],
    ['short id', 'https://youtu.be/abc'],
    ['long id', `https://youtu.be/${ID}x`],
    ['id with a bad character', 'https://youtu.be/dQw4w9WgXc!'],
    ['watch without v', 'https://www.youtube.com/watch'],
    ['channel page', 'https://www.youtube.com/@someone'],
    ['nocookie watch', `https://www.youtube-nocookie.com/watch?v=${ID}`],
    ['not a url', 'hello world'],
    ['empty', ''],
  ])('rejects %s', (_name, input) => {
    expect(parseYouTube(input)).toBeNull()
  })

  it('reads a start time from t or start', () => {
    expect(parseYouTube(`https://youtu.be/${ID}?t=90`)?.startSeconds).toBe(90)
    expect(parseYouTube(`https://youtu.be/${ID}?t=90s`)?.startSeconds).toBe(90)
    expect(parseYouTube(`https://youtu.be/${ID}?t=1m30s`)?.startSeconds).toBe(90)
    expect(parseYouTube(`https://www.youtube.com/embed/${ID}?start=45`)?.startSeconds).toBe(45)
  })

  it('ignores start times it cannot read', () => {
    expect(parseYouTube(`https://youtu.be/${ID}?t=abc`)?.startSeconds).toBeNull()
    expect(parseYouTube(`https://youtu.be/${ID}?t=0`)?.startSeconds).toBeNull()
    expect(parseYouTube(`https://youtu.be/${ID}?t=999999`)?.startSeconds).toBeNull()
    expect(parseYouTube(`https://youtu.be/${ID}`)?.startSeconds).toBeNull()
  })
})
