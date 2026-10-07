/** The explanation of connections, tools and registration shown in the page's "How this works" dialog. */

export interface RegistrationUrls {
  configurationUrl: string
  registrationUrl: string
}

/** The addresses the platform really serves; derived from the API address only when it did not say. */
export function registrationUrls(
  reg: RegistrationUrls | undefined,
  apiUrl: string
): RegistrationUrls {
  if (reg) return reg
  const api = apiUrl.replace(/\/+$/, '')
  return {
    configurationUrl: `${api}/lti/platform/openid-configuration`,
    registrationUrl: `${api}/lti/platform/registration`,
  }
}

export type Actor = 'You' | 'LearnDifferently' | 'The tool'

export interface InfoContent {
  glance: {
    connection: { title: string; text: string; facts: string[] }
    tool: { title: string; text: string; facts: string[] }
    relation: string
  }
  byHand: string
  steps: { actor: Actor; lead: string; text: string }[]
  endpoints: {
    method: 'GET' | 'POST'
    url: string
    access: string
    note: string
  }[]
  accepts: string[]
  refuses: string[]
  safety: string[]
  notes: string[]
}

/** Section ids, in reading order, so each part of the dialog can be linked to. */
export const INFO_SECTION_IDS = ['model', 'by-hand', 'by-link', 'accepts', 'safety', 'limits']

export function infoSections(urls: RegistrationUrls): InfoContent {
  return {
    glance: {
      connection: {
        title: 'Connection',
        text: 'One registration with a tool vendor.',
        facts: ['Client id', 'Deployment id', 'Login, launch and key set addresses'],
      },
      tool: {
        title: 'Tool',
        text: 'Something a course item can open. It belongs to one connection.',
        facts: ['Name', 'Practice lab or graded assessment', 'Who may use it'],
      },
      relation: '1 connection → many tools',
    },
    byHand:
      'Add a connection with the details the vendor gave you, then add its tools to it. Use this for a tool that cannot register itself. Every address must be a public https address. Nothing secret is stored: the vendor signs with its own private key and we read its public keys from the key set address.',
    steps: [
      {
        actor: 'You',
        lead: 'Paste the tool’s registration link.',
        text: 'We add our configuration address and a one-time token to it, and you open the result in a new tab.',
      },
      {
        actor: 'The tool',
        lead: 'Reads our configuration.',
        text: 'Our issuer, our sign-in, token and key addresses, and the scopes we can grant.',
      },
      {
        actor: 'The tool',
        lead: 'Posts its own configuration back.',
        text: 'Its name, login, launch and key set addresses, and what it needs, sent to our registration address with the token.',
      },
      {
        actor: 'LearnDifferently',
        lead: 'Checks it and creates the records.',
        text: 'We make the client id and deployment id ourselves, then add a connection and one tool, switched off.',
      },
      {
        actor: 'You',
        lead: 'Review and switch it on.',
        text: 'Come back here (the page refreshes), choose practice lab or graded assessment, set who may use it, and turn it on.',
      },
    ],
    endpoints: [
      {
        method: 'GET',
        url: urls.configurationUrl,
        access: 'Public',
        note: 'Our configuration, which the tool reads first.',
      },
      {
        method: 'POST',
        url: urls.registrationUrl,
        access: 'Needs the one-time token',
        note: 'Where the tool sends its own configuration.',
      },
    ],
    accepts: [
      'A web tool that signs learners in with an id_token',
      'Proof of identity with a private key (private_key_jwt)',
      'Keys published at an address (jwks_uri)',
      'Public https addresses for login, every redirect and the key set',
      'Scopes for sign-in (openid) and posting a score back',
      'http://localhost, only when running locally',
    ],
    refuses: [
      'Keys pasted inline instead of a key set address',
      'Addresses inside a network, such as localhost, 10.x or 169.254.x',
      'A name longer than 80 characters',
      'Anything that is not a web tool using private_key_jwt',
    ],
    safety: [
      'Only a system administrator can start a registration. The token is random, kept only as a hash, tied to you, valid for 15 minutes and works once.',
      'If your role is removed before the tool uses the link, the registration is refused.',
      'The registration address has no login, so it is limited by size (32 KB), by rate (per address) and by the token.',
      'A tool cannot choose its own client id, whether it is on, who may use it, or whether it counts as a practice lab or an assessment. It always arrives switched off.',
      'Every step is written to the history on this page, with who started it.',
    ],
    notes: [
      'The launch address is the tool’s target_link_uri when it is one of its redirect addresses, otherwise the first one.',
      'Not refused but tidied: scopes beyond sign-in and posting a score are ignored, and hidden or direction-changing characters are removed from the tool\u2019s name so it cannot pass for another.',
      'A tool that does not support Dynamic Registration is added by hand.',
      'A failed attempt leaves the link usable for the time it had left, so the tool can try again.',
      'A switched-off tool cannot be launched, but it can still return a score for work a learner already did.',
      'An address that is a public name but points inside the network is not detected; check addresses you add by hand.',
    ],
  }
}
