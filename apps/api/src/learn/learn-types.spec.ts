import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The API carries a generated copy of the shared types (its build cannot reach
// packages/). If this fails, run: npm run sync:types --workspace @id/api
describe('learn-types copy', () => {
  it('matches packages/types/src/learn.ts', () => {
    const original = readFileSync(
      resolve(__dirname, '../../../../packages/types/src/learn.ts'),
      'utf8'
    )
    const copy = readFileSync(resolve(__dirname, 'learn-types.ts'), 'utf8')
    expect(copy.endsWith(original)).toBe(true)
    expect(copy.startsWith('// GENERATED COPY')).toBe(true)
  })
})
