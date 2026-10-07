/** The explanation of connections, tools and registration shown in the page's "How this works" dialog. */

export interface InfoSection {
  id: string
  title: string
  /** Paragraphs, then optionally a list (ordered when `ordered`). */
  paragraphs: string[]
  items?: string[]
  ordered?: boolean
  /** A short code block: endpoints, field names. */
  code?: string
}

/** The sections, with the real endpoints for this environment (`apiUrl` ends at /api, no trailing slash). */
export function infoSections(apiUrl: string): InfoSection[] {
  const api = apiUrl.replace(/\/+$/, '')
  return [
    {
      id: 'model',
      title: 'Connections and tools',
      paragraphs: [
        'A connection is one registration with a tool vendor: the client id this platform knows the vendor by, a deployment id, and three addresses (login, launch and the key set the vendor publishes its public keys at). Nothing secret is stored; the vendor signs with its own private key and we read its public keys from the key set.',
        'A tool is something a course item can open: its name, whether it is a practice lab or a graded assessment, who may use it, and the connection it launches through. One vendor can offer several tools over one connection, which is why a connection holds many tools and a tool needs exactly one connection.',
      ],
    },
    {
      id: 'by-hand',
      title: 'Adding a tool by hand',
      paragraphs: [
        'Add a connection with the details the vendor gave you, then add its tools to it. Use this for a tool that cannot register itself. The addresses must be public https addresses.',
      ],
    },
    {
      id: 'by-link',
      title: 'Registering a tool from its link (LTI Dynamic Registration)',
      paragraphs: [
        'A tool that supports IMS LTI Dynamic Registration 1.0 can register itself, so nobody copies ids and addresses by hand. Here is what happens:',
      ],
      ordered: true,
      items: [
        'You paste the tool’s registration link. We add two things to it: the address of our configuration and a one-time token, and you open the result in a new tab.',
        'The tool reads our configuration (our issuer, our sign-in, token and key addresses, and the scopes we can grant).',
        'The tool posts its own configuration to our registration address with the token: its name, its login, launch and key set addresses, and what it needs.',
        'We check it, make a client id and deployment id ourselves, and create a connection and one tool. The tool is switched off.',
        'You come back here (the page refreshes), review the new tool, choose practice lab or graded assessment, set who may use it, and switch it on.',
      ],
      code: `GET  ${api}/lti/platform/openid-configuration   (public)\nPOST ${api}/lti/platform/registration            (Authorization: Bearer <one-time token>)`,
    },
    {
      id: 'accepts',
      title: 'What we accept',
      paragraphs: [
        'We register only what we can serve: a web tool that signs learners in with an id_token, proves who it is with a private key (private_key_jwt) and publishes its keys at an address (jwks_uri). Keys pasted inline are not accepted.',
      ],
      items: [
        'Every address (login, each redirect, key set) must be a public https address. Addresses inside a network, such as localhost, 10.x or 169.254.x, are refused. http://localhost is accepted only when running locally.',
        'The launch address is the tool’s target_link_uri when it is one of its redirect addresses, otherwise the first one.',
        'Scopes: sign-in (openid) and posting a score back. Anything else it asks for is ignored.',
        'The tool’s name has hidden and direction-changing characters removed and is limited to 80 characters, so it cannot pass for another tool.',
      ],
    },
    {
      id: 'safety',
      title: 'Why this is safe',
      paragraphs: [],
      items: [
        'Only a system administrator can start a registration. The token is random, kept only as a hash, tied to you, valid for 15 minutes and works once.',
        'If your role is removed before the tool uses the link, the registration is refused.',
        'The registration address has no login, so it is limited by size (32 KB), by rate (per address) and by the token.',
        'A tool cannot choose its own client id, whether it is on, who may use it, or whether it counts as a practice lab or an assessment. It always arrives switched off.',
        'Every step is written to the history on this page, with who started it.',
      ],
    },
    {
      id: 'limits',
      title: 'Good to know',
      paragraphs: [],
      items: [
        'A tool that does not support Dynamic Registration is added by hand.',
        'A failed attempt leaves the link usable for the time it had left, so the tool can try again.',
        'A switched-off tool cannot be launched, but it can still return a score for work a learner already did.',
        'An address that is a public name but points inside the network is not detected; check addresses you add by hand.',
      ],
    },
  ]
}
