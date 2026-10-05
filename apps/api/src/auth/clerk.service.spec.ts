import { ClerkService } from './clerk.service'

const verifyToken = jest.fn()
const getUser = jest.fn()
const createClerkClient = jest.fn((opts: { secretKey: string }) => ({
  users: { getUser: (id: string) => getUser(opts.secretKey, id) },
}))

jest.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => verifyToken(...args),
  createClerkClient: (opts: { secretKey: string }) => createClerkClient(opts),
}))

describe('ClerkService with two Clerk instances', () => {
  const env = { ...process.env }
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CLERK_SECRET_KEY = 'sk_interview'
    process.env.LEARN_CLERK_SECRET_KEY = 'sk_learn'
    process.env.NODE_ENV = 'test'
  })
  afterAll(() => {
    process.env = env
  })

  it('verifyBearerToken only ever uses the Interview Differently key', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'user_id1' })
    const svc = new ClerkService()
    await expect(svc.verifyBearerToken('t')).resolves.toBe('user_id1')
    expect(verifyToken).toHaveBeenCalledWith('t', { secretKey: 'sk_interview' })
  })

  it('verifyLearnToken uses the LearnDifferently key and accepts learn origins', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'user_ld1', azp: 'https://delaware.learndifferently.tech' })
    const svc = new ClerkService()
    await expect(svc.verifyLearnToken('t')).resolves.toBe('user_ld1')
    expect(verifyToken).toHaveBeenCalledWith('t', { secretKey: 'sk_learn' })
  })

  it('verifyLearnToken rejects a token minted for another origin', async () => {
    verifyToken.mockResolvedValueOnce({ sub: 'user_ld1', azp: 'https://evil.example.com' })
    await expect(new ClerkService().verifyLearnToken('t')).resolves.toBeNull()
  })

  it('verifyLearnToken returns null when the signature check fails', async () => {
    verifyToken.mockRejectedValueOnce(new Error('bad signature'))
    await expect(new ClerkService().verifyLearnToken('t')).resolves.toBeNull()
  })

  it('verifyLearnToken is off when the learn key is not configured', async () => {
    delete process.env.LEARN_CLERK_SECRET_KEY
    await expect(new ClerkService().verifyLearnToken('t')).resolves.toBeNull()
    expect(verifyToken).not.toHaveBeenCalled()
  })

  it('looks roles up on the instance named by source, defaulting to Interview Differently', async () => {
    getUser.mockResolvedValue({ publicMetadata: { role: 'agency-admin' } })
    const svc = new ClerkService()
    await svc.getRole('u1')
    expect(getUser).toHaveBeenLastCalledWith('sk_interview', 'u1')
    await expect(svc.getRole('u2', 'learn')).resolves.toBe('agency-admin')
    expect(getUser).toHaveBeenLastCalledWith('sk_learn', 'u2')
  })

  it('getRole for learn is null when the learn key is missing', async () => {
    delete process.env.LEARN_CLERK_SECRET_KEY
    await expect(new ClerkService().getRole('u2', 'learn')).resolves.toBeNull()
  })
})
