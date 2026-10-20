import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma's CLI (migrate, db execute, db seed) connects as the database owner: SCHEMA_DATABASE_URL, or DATABASE_URL
// where it is not set (a fresh checkout). The API itself connects as the restricted role, see src/prisma/client.ts
// and docs/tenant-isolation.md. `prisma generate` needs no connection, so a missing URL is left empty.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node -r tsconfig-paths/register prisma/seed.ts',
  },
  datasource: {
    url: process.env.SCHEMA_DATABASE_URL || process.env.DATABASE_URL || '',
  },
})
