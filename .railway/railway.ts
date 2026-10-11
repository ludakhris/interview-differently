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

  // `dev`: the shared development environment. Its database is what apps/api/.env points at (its
  // DATABASE_PUBLIC_URL), and `api-dev` is an API that runs beside it, deployed by hand from any branch:
  //   apps/api/scripts/deploy-dev.sh
  // so a branch can be tried against dev data on Railway's own network (with row-level security on)
  // before it reaches production. It has no GitHub source, so nothing deploys it automatically, and none
  // of production's secrets live here: the values marked preserve() are set by hand from dev keys
  // (scripts/railway-dev-vars.sh). Create the environment first with `railway environment new dev`; IaC
  // can't create one.
  if (ctx.isEnvironment('dev')) {
    const apiDev = service('api-dev', {
      build: {
        buildCommand: '/app/node_modules/.bin/nest build',
        buildEnvironment: 'V3',
        builder: 'NIXPACKS',
      },
      // The API connects as the restricted role (DATABASE_URL), which is what row-level security binds; migrations
      // and the seed use the owner (SCHEMA_DATABASE_URL). See docs/tenant-isolation.md.
      start: 'npx prisma migrate deploy && npm run db:seed && node dist/main.js',
      deploy: { restartPolicyMaxRetries: 3 },
      replicas: { 'us-east4-eqdc4a': 1 },
      env: {
        NODE_ENV: 'development',
        TRUST_PROXY: '1',
        // Browser origins of Vercel preview deployments of the two front ends (never set in production); built from
        // your own Vercel team by scripts/railway-dev-vars.sh, so no team name is written here.
        PREVIEW_ORIGIN_PATTERN: preserve(),
        // Dev values, set by hand (scripts/railway-dev-vars.sh); the restricted role's URL, the owner's URL,
        // and keys for the dev Clerk instances and dev services.
        DATABASE_URL: preserve(),
        SCHEMA_DATABASE_URL: '${{Postgres.DATABASE_URL}}',
        // The dev API must run with row-level security: refuse to start if it is connected as the owner.
        REQUIRE_TENANT_RLS: 'on',
        FRONTEND_URL: preserve(),
        CLERK_SECRET_KEY: preserve(),
        LEARN_CLERK_SECRET_KEY: preserve(),
        ANTHROPIC_API_KEY: preserve(),
        OPENAI_API_KEY: preserve(),
        DID_API_KEY: preserve(),
        ADMIN_EMAIL: preserve(),
        LTI_API_BASE: preserve(),
        LTI_HINT_SECRET: preserve(),
        LTI_ID_WEB_URL: preserve(),
        LTI_LEARN_URL: preserve(),
        LTI_PLATFORM_PRIVATE_KEY: preserve(),
        LTI_RETURN_URL: preserve(),
        LTI_TOOL_PRIVATE_KEY: preserve(),
        LTI_TOOL_SECRET: preserve(),
        R2_ACCESS_KEY_ID: preserve(),
        R2_ACCOUNT_ID: preserve(),
        R2_BUCKET: preserve(),
        R2_PUBLIC_URL: preserve(),
        R2_RESPONSES_BUCKET: preserve(),
        R2_SECRET_ACCESS_KEY: preserve(),
        RESEND_API_KEY: preserve(),
      },
    })
    return project('interview-differently', { resources: [Postgres, apiDev] })
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
      // Prisma's CLI (migrate deploy in the start command) connects with this one: the owner. DATABASE_URL is the
      // restricted role the API runs as (docs/tenant-isolation.md).
      SCHEMA_DATABASE_URL: '${{Postgres.DATABASE_URL}}',
      // Refuse to start unless DATABASE_URL is the restricted role, so row-level security is never silently off.
      REQUIRE_TENANT_RLS: 'on',
      DID_API_KEY: preserve(),
      FRONTEND_URL: preserve(),
      LTI_API_BASE: preserve(),
      LTI_HINT_SECRET: preserve(),
      LTI_ID_WEB_URL: preserve(),
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
