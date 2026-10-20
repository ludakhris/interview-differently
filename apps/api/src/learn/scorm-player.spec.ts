import { PLAYER_KEY, scormPlayerHtml, scormSrc } from './scorm-player'

describe('SCORM player page', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })

  it('launches through the player on the public media host in production, never the Learn origin', () => {
    process.env.NODE_ENV = 'production'
    process.env.R2_PUBLIC_URL = 'https://media.example.com/'
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    const src = scormSrc(id, 'story/my page.html?mode=1')
    expect(src).toBe(
      `https://media.example.com/learn-scorm/${PLAYER_KEY}#e=` +
        encodeURIComponent(`${id}/story/my%20page.html?mode=1`)
    )
  })

  it('serves packages from this API outside production', () => {
    process.env.NODE_ENV = 'development'
    process.env.API_PUBLIC_URL = 'https://api.example.com'
    expect(scormSrc('p', 'index.html')).toMatch(
      /^https:\/\/api\.example\.com\/api\/scorm-files\/_player\/v1\.html#e=/
    )
  })

  it('gives the package the cross-frame API and opens it in a frame inside the player', () => {
    const html = scormPlayerHtml()
    expect(html).toContain('CrossFrameAPI')
    expect(html).toContain('window.API_1484_11 = api')
    expect(html).toContain("frame.src = '../' + entry")
  })
})
