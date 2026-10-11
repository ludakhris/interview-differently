import { Injectable, NestMiddleware } from '@nestjs/common'
import { withTenantContext } from './tenant-context'

/** Opens an empty tenant context for each request; the guard that verifies the caller fills it in. */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void): void {
    withTenantContext(next)
  }
}
