/**
 * Import this first in anything that reads or changes the database as its owner: the seed and the scripts.
 * DATABASE_URL is the API's connection, the restricted role that row-level security binds, and it can neither change
 * the schema nor see across agencies. SCHEMA_DATABASE_URL is the owner. (Prisma's own CLI takes it from `directUrl`
 * in the schema.) Where it is not set, DATABASE_URL is used as it is, which is how a fresh checkout works.
 */
import 'dotenv/config'

if (process.env.SCHEMA_DATABASE_URL) process.env.DATABASE_URL = process.env.SCHEMA_DATABASE_URL
