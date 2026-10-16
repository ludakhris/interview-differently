import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import institutionScope from './eslint-rules/institution-scope.js'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: { local: { rules: { 'institution-scope': institutionScope } } },
    rules: { 'local/institution-scope': 'error' },
  },
  {
    // plain Node scripts (the .ts ones get Node's types from tsconfig)
    files: ['scripts/**/*.mjs', 'prisma/**/*.mjs'],
    languageOptions: { globals: globals.node },
  }
)
