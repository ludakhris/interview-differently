import { BadRequestException } from '@nestjs/common'
import { ScormController } from './scorm.controller'

describe('ScormController.upload input checks', () => {
  it('refuses a title that is not text with a 400, before storing the package', async () => {
    const courses = { assertModuleAccess: jest.fn(), addScormItem: jest.fn() }
    const scorm = { store: jest.fn() }
    const c = new ScormController(courses as never, scorm as never)
    const req = { userId: 'u1', userRole: 'agency-admin', body: { title: ['a', 'b'] } }
    await expect(
      c.upload(req as never, 'm1', { buffer: Buffer.from('zip') })
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(scorm.store).not.toHaveBeenCalled()
    expect(courses.addScormItem).not.toHaveBeenCalled()
  })
})
