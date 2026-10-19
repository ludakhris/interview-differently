import { LocalDiskPrivateStorage } from './local-disk-storage'

describe('LocalDiskPrivateStorage', () => {
  it('refuses a key that would leave the storage folder', async () => {
    const storage = new LocalDiskPrivateStorage()
    await expect(storage.read('../../package.json')).resolves.toBeNull()
    await expect(storage.read('../scenario-media-x/a')).resolves.toBeNull()
  })
})
