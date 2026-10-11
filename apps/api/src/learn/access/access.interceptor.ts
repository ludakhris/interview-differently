import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, tap } from 'rxjs'
import { wasAuthorized } from '../../core/tenant-context'
import { ACCESS_METADATA, type AccessDeclaration } from './access.decorator'

/**
 * A safety net for `@Access(action)`, not the guard: a route that declares an action should have passed an
 * access check for that action before it answers. If a handler forgot to call AccessService, the mistake is
 * logged and the response is withheld, so a forgotten check shows up in testing instead of shipping quietly.
 *
 * What it does NOT do: it runs after the handler, so a write has already happened by then; and it only knows an
 * action was checked, not on which workspace or cohort, so a check on the wrong scope still passes. The checks
 * themselves live in the services, and the database keeps agencies apart whatever happens here.
 */
@Injectable()
export class AccessInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AccessInterceptor.name)

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const declared = this.reflector.get<AccessDeclaration | undefined>(
      ACCESS_METADATA,
      context.getHandler()
    )
    if (declared?.kind !== 'action') return next.handle()
    return next.handle().pipe(
      tap(() => {
        if (wasAuthorized(declared.action)) return
        const where = `${context.getClass().name}.${context.getHandler().name}`
        this.logger.error(`${where} declares ${declared.action} but did not pass that access check`)
        throw new InternalServerErrorException('This route did not check access')
      })
    )
  }
}
