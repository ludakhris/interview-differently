import 'dotenv/config'
import './instrument' // must precede framework imports
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { json, raw } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'

async function bootstrap() {
  // bodyParser off so we can size the JSON limit per route below.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })
  // Railway terminates TLS at its proxy: trust one hop so req.ip (used by the
  // throttler and rate limits) is the client, not the proxy.
  app.set('trust proxy', 1)
  // API only serves JSON/media redirects — helmet's defaults are safe here.
  // cross-origin resource policy relaxed: the web app (another origin) reads responses.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  // Dataset setup scripts (#25) and assessment imports are the only large JSON
  // bodies (a few thousand INSERT rows is ~200kb+). Everything else gets 1mb.
  const big = json({ limit: '5mb' })
  app.use('/api/admin/datasets', big)
  app.use('/api/admin/assessments', big)
  // Clerk's webhook signature is over the raw bytes — must not be JSON-parsed.
  app.use('/api/webhooks/clerk', raw({ type: 'application/json', limit: '1mb' }))
  app.use(json({ limit: '1mb' }))
  app.useGlobalPipes(new ValidationPipe())
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' })
  app.setGlobalPrefix('api')
  const port = process.env.PORT ?? 3000
  await app.listen(port)
  console.log(`API running on port ${port}`)
}

bootstrap()
