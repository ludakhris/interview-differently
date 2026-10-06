// Copies packages/types/src/learn.ts into the API as src/learn/learn-types.ts.
//
// The Railway build for the API only has the apps/api folder, so it cannot
// import the shared package. packages/types stays the single source (the web
// app imports it); this copy is generated, and a test fails CI if they differ.
//
//   npm run sync:types --workspace @id/api
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../../packages/types/src/learn.ts')
const target = resolve(here, '../src/learn/learn-types.ts')

export const HEADER = `// GENERATED COPY of packages/types/src/learn.ts. Do not edit here.
// Edit the original, then run: npm run sync:types --workspace @id/api
// (The API build has no access to packages/, so it carries its own copy.)

`

writeFileSync(target, HEADER + readFileSync(source, 'utf8'))
console.log('Wrote src/learn/learn-types.ts')
