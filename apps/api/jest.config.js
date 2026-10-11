/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // Specs that start Postgres (PGlite) and replay every migration take a few seconds, more when CI runs
  // several at once.
  testTimeout: 60000,
  setupFiles: ['<rootDir>/test-setup.ts'],
}
