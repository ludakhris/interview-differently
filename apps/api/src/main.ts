import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { corsOrigin } from './cors'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // Express's default 100kb JSON limit rejects dataset setup scripts (#25) — a
  // few thousand INSERT rows is already ~200kb.
  app.useBodyParser('json', { limit: '5mb' })
  app.enableCors({ origin: corsOrigin(process.env.FRONTEND_URL) })
  // Behind a proxy (Railway) set TRUST_PROXY=1 so req.ip is the client, which the LTI rate limits key on.
  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY)
    app.set('trust proxy', Number.isInteger(hops) ? hops : true)
  }
  app.setGlobalPrefix('api')
  const port = process.env.PORT ?? 3000
  await app.listen(port)
  console.log(`API running on port ${port}`)
}

bootstrap()
