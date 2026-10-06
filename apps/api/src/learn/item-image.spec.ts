import { imageUrl, isImageKey, sniffImage } from './item-image'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8)])
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.alloc(4),
  Buffer.from('WEBP', 'latin1'),
  Buffer.alloc(4),
])
const ID = '0b9d1c64-3f0e-4d58-9c11-6a1f2f6a9d10'

describe('sniffImage', () => {
  it('knows PNG, JPEG and WebP from their first bytes', () => {
    expect(sniffImage(PNG)?.type).toBe('image/png')
    expect(sniffImage(JPG)?.ext).toBe('jpg')
    expect(sniffImage(WEBP)?.ext).toBe('webp')
  })

  it('rejects SVG, HTML, GIF, empty and truncated files', () => {
    expect(
      sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))
    ).toBeNull()
    expect(sniffImage(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull()
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull()
    expect(sniffImage(Buffer.alloc(0))).toBeNull()
    expect(sniffImage(PNG.subarray(0, 4))).toBeNull()
    expect(sniffImage(Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(8)]))).toBeNull()
  })
})

describe('isImageKey', () => {
  it('accepts only the keys this app writes', () => {
    expect(isImageKey(`learn-images/${ID}.png`)).toBe(true)
    expect(isImageKey(`learn-images/${ID}.webp`)).toBe(true)
    expect(isImageKey(`learn-images/${ID}.svg`)).toBe(false)
    expect(isImageKey(`learn-images/../${ID}.png`)).toBe(false)
    expect(isImageKey(`other/${ID}.png`)).toBe(false)
    expect(isImageKey('https://evil.example/x.png')).toBe(false)
    expect(isImageKey(undefined)).toBe(false)
  })
})

describe('imageUrl', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })

  it('uses the public bucket in production and the local API elsewhere', () => {
    process.env.NODE_ENV = 'production'
    process.env.R2_PUBLIC_URL = 'https://media.example.com/'
    expect(imageUrl(`learn-images/${ID}.png`)).toBe(
      `https://media.example.com/learn-images/${ID}.png`
    )
    process.env.NODE_ENV = 'development'
    process.env.API_PUBLIC_URL = 'http://localhost:3000'
    expect(imageUrl(`learn-images/${ID}.png`)).toBe(
      `http://localhost:3000/api/scenario-media/files/learn-images/${ID}.png`
    )
  })
})
