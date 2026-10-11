import { SetMetadata } from '@nestjs/common'
import type { Action } from './permissions'

/**
 * What a Learn Differently route says about who may call it (GitHub issue #84). Every route declares one,
 * and a test fails the build when one does not.
 *
 *  - `@Access('cohort.manage')`: the route does that action; the service must pass the matching check
 *    (AccessService.authorize) before it answers, or the response is withheld (AccessInterceptor).
 *  - `@SelfOnly()`: works on the signed-in person's own data only, whatever their role.
 *  - `@Public()`: needs no sign-in.
 */
export const ACCESS_METADATA = 'learn:access'

export type AccessDeclaration =
  | { kind: 'action'; action: Action }
  | { kind: 'self' }
  | { kind: 'public' }

export const Access = (action: Action) =>
  SetMetadata(ACCESS_METADATA, { kind: 'action', action } satisfies AccessDeclaration)
export const SelfOnly = () =>
  SetMetadata(ACCESS_METADATA, { kind: 'self' } satisfies AccessDeclaration)
export const Public = () =>
  SetMetadata(ACCESS_METADATA, { kind: 'public' } satisfies AccessDeclaration)
