import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Static accessibility checks on every screen, signed-in ones included.
  {
    files: ['src/**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Our labels wrap the control and put the text one level further in (label > span > strong).
      'jsx-a11y/label-has-associated-control': [
        'error',
        { depth: 3, controlComponents: ['OwnerSelect'] },
      ],
      // autoFocus is used only on a field the person has just opened (a new form, an inline edit), never on page load.
      'jsx-a11y/no-autofocus': 'off',
      // Chart rows and scrollable regions are focusable so keyboard users can reach their labels.
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'listitem', 'region'] },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  }
)
