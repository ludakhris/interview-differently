import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { AuthenticatedGuard } from '../../auth/authenticated.guard'
import { LtiError } from '../lti-spec'
import { SESSION_BEARER_PREFIX, verifySession, type LtiSession } from './lti-session'

export interface LtiRequest {
  method: string
  originalUrl?: string
  url: string
  headers: Record<string, string | undefined>
  body?: { scenarioId?: unknown } | null
  userId?: string
  lti?: Omit<LtiSession, 'sub'>
}

type Allow = (session: LtiSession, req: LtiRequest) => boolean
const bodyScenario: Allow = (s, req) => req.body?.scenarioId === s.ref

/**
 * Everything an LTI session may reach, by method and path (without the /api prefix). Each entry
 * is matched against the whole path, then its `allow` check (if any) must pass for the session's
 * ref. Anything not listed is refused, so a new endpoint is never reachable with an LTI token by
 * accident. Ownership of a result or immersive session is checked by the controller.
 */
const ALLOWED: { method: string; path: RegExp; allow?: Allow }[] = [
  { method: 'GET', path: /^\/scenarios\/[^/]+$/, allow: (s, req) => idOf(req) === s.ref },
  { method: 'POST', path: /^\/results\/attempts$/, allow: bodyScenario },
  { method: 'POST', path: /^\/results$/, allow: bodyScenario },
  {
    // read-only, one dataset: a slug the launched scenario's sql nodes use (fixed in the token at
    // launch); the controller re-checks it against the scenario. Never the list or admin routes.
    method: 'GET',
    path: /^\/me\/datasets\/[^/]+$/,
    allow: (s, req) => {
      const slug = datasetSlugOf(req)
      return slug !== undefined && (s.datasets ?? []).includes(slug)
    },
  },
  { method: 'GET', path: /^\/results\/[^/]+$/ },
  // immersive (voice) interview: create a session for the launched ref and, for a session, upload
  // answers and read it back. The controller checks the session belongs to the learner and the ref.
  { method: 'POST', path: /^\/immersive-sessions$/, allow: bodyScenario },
  { method: 'POST', path: /^\/immersive-sessions\/[^/]+\/responses$/ },
  { method: 'GET', path: /^\/immersive-sessions\/[^/]+$/ },
  { method: 'GET', path: /^\/immersive-sessions\/[^/]+\/responses\/[^/]+$/ },
  { method: 'GET', path: /^\/immersive-sessions\/[^/]+\/responses\/[^/]+\/media-url$/ },
  { method: 'GET', path: /^\/lti\/tool\/session$/ },
  { method: 'POST', path: /^\/lti\/tool\/complete$/ },
]

const pathOf = (req: LtiRequest): string => {
  const raw = (req.originalUrl ?? req.url).split('?')[0].replace(/\/+$/, '')
  return raw.replace(/^\/api(?=\/)/, '')
}

function idOf(req: LtiRequest): string | undefined {
  const m = /^\/scenarios\/([^/]+)$/.exec(pathOf(req))
  try {
    return m ? decodeURIComponent(m[1]) : undefined
  } catch {
    return undefined
  }
}

function datasetSlugOf(req: LtiRequest): string | undefined {
  const m = /^\/me\/datasets\/([^/]+)$/.exec(pathOf(req))
  try {
    return m ? decodeURIComponent(m[1]) : undefined
  } catch {
    return undefined
  }
}

/** The LTI session in a `Bearer lti.<token>` header, or undefined for any other (Clerk) header. */
function bearerSession(req: LtiRequest): { token: string } | undefined {
  const auth = req.headers['authorization'] ?? req.headers['Authorization']
  if (!auth?.startsWith('Bearer ')) return undefined
  const token = auth.slice('Bearer '.length).trim()
  return token.startsWith(SESSION_BEARER_PREFIX)
    ? { token: token.slice(SESSION_BEARER_PREFIX.length) }
    : undefined
}

/** Verifies the token, checks the route against the allowlist and attaches userId and lti. */
function authorizeLti(req: LtiRequest, token: string): true {
  let session: LtiSession
  try {
    session = verifySession(token)
  } catch (err) {
    if (err instanceof LtiError) throw new UnauthorizedException(err.message)
    throw err
  }
  const path = pathOf(req)
  const rule = ALLOWED.find((r) => r.method === req.method && r.path.test(path))
  if (!rule || (rule.allow && !rule.allow(session, req))) {
    throw new ForbiddenException('This session cannot be used here')
  }
  req.userId = session.sub
  const { sub: _sub, ...lti } = session
  req.lti = lti
  return true
}

/** A signed-in Clerk user (exactly as AuthenticatedGuard) or an LTI session on an allowed route. */
@Injectable()
export class AuthenticatedOrLtiGuard implements CanActivate {
  constructor(private readonly clerkGuard: AuthenticatedGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<LtiRequest>()
    const lti = bearerSession(req)
    if (lti) return authorizeLti(req, lti.token)
    return this.clerkGuard.canActivate(context)
  }
}

/** For routes that stay anonymous or Clerk-optional: only an LTI Bearer token is checked here. */
@Injectable()
export class LtiSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<LtiRequest>()
    const lti = bearerSession(req)
    if (!lti) return true
    // the scenario list is public summaries: a valid session reads it as an anonymous viewer
    if (req.method === 'GET' && pathOf(req) === '/scenarios') {
      try {
        verifySession(lti.token)
      } catch (err) {
        if (err instanceof LtiError) throw new UnauthorizedException(err.message)
        throw err
      }
      return true
    }
    return authorizeLti(req, lti.token)
  }
}

/** An LTI session is required (the score return). */
@Injectable()
export class LtiOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<LtiRequest>()
    const lti = bearerSession(req)
    if (!lti) throw new UnauthorizedException('Missing LTI session')
    return authorizeLti(req, lti.token)
  }
}
