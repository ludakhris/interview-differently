import { ArgumentsHost, Catch, HttpException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import * as Sentry from '@sentry/nestjs'

/**
 * Reports server-side failures (5xx or non-HTTP errors) to Sentry, then lets
 * Nest respond as usual. Our controllers turn upstream AI/D-ID failures into
 * 503 HttpExceptions — Sentry's stock filter ignores HttpExceptions, which
 * would hide exactly the paid-vendor outages we want to see. 4xx are client
 * errors and are not reported.
 */
@Catch()
export class ErrorReportingFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    if (status >= 500) Sentry.captureException(exception)
    super.catch(exception, host)
  }
}
