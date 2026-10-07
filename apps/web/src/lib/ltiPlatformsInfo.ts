/** The text and addresses behind the "How this works" dialog on the Platforms admin page. */

export interface ToolEndpoints {
  /** Where a platform's admin sends the registration link. */
  registrationUrl: string
  loginUrl: string
  launchUrl: string
  jwksUrl: string
}

/** The addresses the API says it serves; derived from the API address only when it did not say. */
export function toolEndpoints(
  endpoints: Partial<ToolEndpoints> | null | undefined,
  apiUrl: string
): ToolEndpoints {
  const base = `${apiUrl.replace(/\/+$/, '')}/api/lti/tool`
  return {
    registrationUrl: endpoints?.registrationUrl || `${base}/register`,
    loginUrl: endpoints?.loginUrl || `${base}/login`,
    launchUrl: endpoints?.launchUrl || `${base}/launch`,
    jwksUrl: endpoints?.jwksUrl || `${base}/jwks`,
  }
}

export type Actor = 'You' | 'The platform' | 'Interview Differently'

export interface InfoContent {
  glance: { title: string; text: string; facts: string[] }[]
  relation: string
  steps: { actor: Actor; lead: string; text: string }[]
  approval: string[]
  addresses: { label: string; url: string; note: string }[]
  accepts: string[]
  refuses: string[]
  safety: string[]
  notes: string[]
}

/** Section ids, in reading order, so each part of the dialog can be linked to. */
export const INFO_SECTION_IDS = [
  'model',
  'registering',
  'approval',
  'addresses',
  'accepts',
  'safety',
  'notes',
]

export function infoContent(e: ToolEndpoints): InfoContent {
  return {
    glance: [
      {
        title: 'Platform',
        text: 'The learning system that launches Interview Differently.',
        facts: ['Issuer', 'Client id', 'Deployment id'],
      },
      {
        title: 'Registration',
        text: 'How a platform becomes known here.',
        facts: ['By hand, by someone with database access', 'By itself, from its own link'],
      },
    ],
    relation: 'Issuer + client id + deployment id → one platform',
    steps: [
      {
        actor: 'You',
        lead: 'Give the platform our registration address.',
        text: 'It is the first address in the table below. Nothing is shared except that address.',
      },
      {
        actor: 'The platform',
        lead: 'Its administrator opens that address.',
        text: 'They add the platform’s configuration link and a one-time token to it, and open the result in a browser.',
      },
      {
        actor: 'Interview Differently',
        lead: 'Reads the platform’s configuration.',
        text: 'It checks that every address in it is public https and on one origin.',
      },
      {
        actor: 'Interview Differently',
        lead: 'Posts its own configuration back.',
        text: 'Our login, launch and key set addresses and scopes, sent to the platform with the token.',
      },
      {
        actor: 'The platform',
        lead: 'Makes a client id and deployment id.',
        text: 'It answers with both. We store the platform switched off.',
      },
      {
        actor: 'Interview Differently',
        lead: 'Shows a page that closes the tab.',
        text: 'The page says the registration is waiting for approval and tells the platform to close the tab.',
      },
    ],
    approval: [
      'A registered platform waits on this page, switched off, until an administrator enables it. Registering the same issuer and client id again changes nothing.',
      'Reject removes a platform that was never approved, and it would have to register again. Once a platform has been approved, switch it off instead.',
      'Every change is kept in the history under each platform, with who made it.',
    ],
    addresses: [
      {
        label: 'Registration address',
        url: e.registrationUrl,
        note: 'The platform’s admin opens this with its configuration link and token.',
      },
      {
        label: 'Login address',
        url: e.loginUrl,
        note: 'Where a launch starts (third-party initiated login).',
      },
      {
        label: 'Launch address',
        url: e.launchUrl,
        note: 'The redirect and target link for a launch.',
      },
      {
        label: 'Key set address',
        url: e.jwksUrl,
        note: 'Our public keys, so the platform can check what we sign.',
      },
    ],
    accepts: [
      'Public https addresses, all on one origin',
      'Platforms that sign with RS256',
      'Proof of identity with a private key (private_key_jwt)',
      'Scopes for sign-in (openid) and for sending a score back',
    ],
    refuses: [
      'Addresses that are not public https, or that sit on another origin',
      'Keys pasted inline instead of a key set address',
      'A platform that does not support RS256 or private_key_jwt',
      'Anything over 64 KB, more than 10 requests a minute from one address, or a 51st waiting registration',
    ],
    safety: [
      'A registration never switches anything on. The platform waits here until you approve it.',
      'The one-time token is sent to the platform and never stored or logged.',
      'Learners from a platform are stored separately, as lti:<platform>:<id>, so two platforms can never share or claim each other’s results.',
      'A switched-off platform cannot start launches, but work a learner already did can still be returned to it.',
    ],
    notes: [
      'A built-in LearnDifferently platform appears here until it is added as a row of its own.',
      'A platform that uses a different origin for its endpoints (for example keys on another domain) is refused and needs a row added by hand.',
      'An address that is a public name but points inside the network is not detected.',
    ],
  }
}

/**
 * Copies text to the clipboard. Uses the async clipboard when there is one, and a hidden textarea
 * when there is not (an insecure page or an older browser). Resolves false when both fail.
 */
export async function copyText(
  text: string,
  nav: Pick<Navigator, 'clipboard'> | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document
): Promise<boolean> {
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the textarea
  }
  if (!doc) return false
  const area = doc.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  doc.body.appendChild(area)
  area.select()
  try {
    return doc.execCommand('copy')
  } catch {
    return false
  } finally {
    doc.body.removeChild(area)
  }
}
