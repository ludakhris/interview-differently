import { json } from 'express'

/** The tool registration endpoint has no login, so its body must stay small. */
export const REGISTRATION_PATH = '/api/lti/platform/registration'
export const REGISTRATION_BODY_LIMIT = '32kb'

/**
 * Parses the registration request with a small limit before the app-wide parser (which allows 5mb for
 * dataset scripts) can see it: anything larger is refused with 413 before it is read or parsed.
 * Call before the global body parser is set up.
 */
export function limitRegistrationBody(app: { use: (path: string, handler: unknown) => unknown }) {
  const parse = json({ limit: REGISTRATION_BODY_LIMIT })
  // Wrapped so its name is not "jsonParser": Nest skips installing its own JSON parser when it finds
  // one by that name, which would leave every other route without a parsed body.
  app.use(REGISTRATION_PATH, function registrationBodyParser(req: never, res: never, next: never) {
    parse(req, res, next)
  })
}
