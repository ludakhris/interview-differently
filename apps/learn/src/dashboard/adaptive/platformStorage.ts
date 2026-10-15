/**
 * LTI platform storage (1EdTech "LTI Client Side postMessages"), the platform's half. A tool framed in the course page
 * cannot rely on its own cookie (browsers block cross-site cookies in frames), so during its login it keeps a value in
 * this page instead (`lti.put_data`) and reads it back on launch (`lti.get_data`). Values are kept per tool origin, in
 * memory, for this page only. Messages from any origin other than the launched tool's are ignored by the caller.
 */

const SUPPORTED = ['lti.capabilities', 'lti.put_data', 'lti.get_data']

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The reply to one storage message, or null when it is not a storage message. */
export function storageReply(
  store: Map<string, string>,
  origin: string,
  message: unknown
): Record<string, unknown> | null {
  if (!isObject(message) || typeof message.subject !== 'string') return null
  const { subject } = message
  if (!SUPPORTED.includes(subject)) return null
  const reply = { subject: `${subject}.response`, message_id: message.message_id }
  if (subject === 'lti.capabilities')
    return {
      ...reply,
      supported_messages: SUPPORTED.filter((s) => s !== 'lti.capabilities').map((s) => ({
        subject: s,
      })),
    }
  const key = typeof message.key === 'string' && message.key.length <= 200 ? message.key : null
  if (!key) return { ...reply, error: { code: 'bad_request', message: 'A key is required' } }
  const slot = `${origin}|${key}`
  if (subject === 'lti.put_data') {
    if (typeof message.value !== 'string' || message.value.length > 4096)
      return { ...reply, error: { code: 'bad_request', message: 'A string value is required' } }
    store.set(slot, message.value)
    return { ...reply, key, value: message.value }
  }
  const value = store.get(slot)
  if (value === undefined)
    return { ...reply, key, error: { code: 'bad_request', message: 'No value for that key' } }
  return { ...reply, key, value }
}
