import {
  bucket,
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  redis,
  service,
  volume,
} from 'railway/iac'

export default defineRailway((ctx) => {
  const Postgres = postgres('Postgres', { region: 'us-east4-eqdc4a' })
  Postgres.networking = { privateNetworkEndpoint: 'postgres', tcpProxies: { '5432': {} } }

  // `dev`: a throwaway database for local development (apps/api/.env points
  // at its DATABASE_PUBLIC_URL). Nothing else runs there. Create the
  // environment first with `railway environment new dev`; IaC can't create one.
  if (ctx.isEnvironment('dev')) {
    return project('interview-differently', { resources: [Postgres] })
  }

  const Redis = redis('Redis', { region: 'us-east4-eqdc4a' })
  Redis.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  }
  Redis.networking = { privateNetworkEndpoint: 'redis', tcpProxies: { '6379': {} } }
  const redisVolume = volume('redis-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'us-east4-eqdc4a',
    sizeMB: 500,
  })
  const postgresVolume81ms = volume('postgres-volume-81ms', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'us-east4-eqdc4a',
    sizeMB: 500,
  })
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'us-east4-eqdc4a',
    sizeMB: 500,
  })
  const PostgresPITR = bucket('Postgres-PITR', { region: 'iad' })
  const interviewDifferently = service('interview-differently', {
    source: github('ludakhris/interview-differently', {
      checkSuites: true,
      rootDirectory: '/apps/api',
    }),
    // Carried over from the former apps/api/railway.json. Nixpacks picks up
    // apps/api/nixpacks.toml from the root directory, and ON_FAILURE is the
    // stored restart policy; declaring either makes the plan report false drift.
    build: {
      buildCommand: '/app/node_modules/.bin/nest build',
      buildEnvironment: 'V3',
      builder: 'NIXPACKS',
      watchPatterns: ['apps/api/**', 'packages/types/**'],
    },
    start: 'npx prisma migrate deploy && npm run db:seed && node dist/main.js',
    deploy: { restartPolicyMaxRetries: 3 },
    replicas: { 'us-east4-eqdc4a': 1 },
    domains: ['api.interviewdifferently.com'],
    env: {
      ADMIN_EMAIL: preserve(),
      ANTHROPIC_API_KEY: preserve(),
      CLERK_SECRET_KEY: preserve(),
      DATABASE_URL: preserve(),
      DID_API_KEY: preserve(),
      FRONTEND_URL: preserve(),
      LTI_API_BASE: preserve(),
      LTI_HINT_SECRET: preserve(),
      LTI_LEARN_URL: preserve(),
      LTI_PLATFORM_PRIVATE_KEY: preserve(),
      LTI_RETURN_URL: preserve(),
      LTI_TOOL_PRIVATE_KEY: preserve(),
      LTI_TOOL_SECRET: preserve(),
      LEARN_CLERK_SECRET_KEY: preserve(),
      NODE_ENV: preserve(),
      OPENAI_API_KEY: preserve(),
      R2_ACCESS_KEY_ID: preserve(),
      R2_ACCOUNT_ID: preserve(),
      R2_BUCKET: preserve(),
      R2_PUBLIC_URL: preserve(),
      R2_RESPONSES_BUCKET: preserve(),
      R2_SECRET_ACCESS_KEY: preserve(),
      REDIS_URL: preserve(),
      RESEND_API_KEY: preserve(),
      TRUST_PROXY: preserve(),
    },
  })

  return project('interview-differently', {
    resources: [
      Redis,
      interviewDifferently,
      Postgres,
      redisVolume,
      postgresVolume81ms,
      postgresVolume,
      PostgresPITR,
    ],
  })
})
