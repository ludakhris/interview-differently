import { EditorView } from '@uiw/react-codemirror'

/**
 * Overrides the stock CodeMirror dark theme's blue-grey chrome so the editor
 * sits flush with the app's near-black panels. Syntax colours are left alone.
 */
// Colours read the same --ld-* variables as the Tailwind tokens (set only on the LTI root), with
// today's values as fallbacks.
const ink = (a: number) => `rgb(var(--ld-ink, 255 255 255) / ${a})`
const deep = 'rgb(var(--ld-surface-deep, 13 13 13))'
const raised = 'rgb(var(--ld-surface-alt, 22 22 22))'

export const sandboxEditorTheme = EditorView.theme(
  {
    // !important — @uiw's built-in dark theme is injected after ours.
    '&': { backgroundColor: `${deep} !important` },
    '.cm-gutters': {
      backgroundColor: `${deep} !important`,
      borderRight: `1px solid ${ink(0.06)} !important`,
      color: `${ink(0.25)} !important`,
    },
    '.cm-activeLine': { backgroundColor: `${ink(0.03)} !important` },
    '.cm-activeLineGutter': { backgroundColor: `${ink(0.03)} !important` },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: `rgb(var(--ld-accent, 45 158 95) / 0.25) !important`,
    },
    '.cm-cursor': { borderLeftColor: 'rgb(var(--ld-text, 245 243 238))' },
    '.cm-placeholder': { color: `${ink(0.2)}` },
    // Autocomplete popup
    '.cm-tooltip': {
      backgroundColor: `${raised} !important`,
      border: `1px solid ${ink(0.12)} !important`,
      borderRadius: '8px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '12px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
      color: `rgb(var(--ld-text, 245 243 238) / 0.85)`,
      padding: '3px 8px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: `rgb(var(--ld-accent, 45 158 95) / 0.25) !important`,
      color: 'rgb(var(--ld-text, 245 243 238)) !important',
    },
    '.cm-completionDetail': {
      color: `${ink(0.35)}`,
      fontStyle: 'normal',
      marginLeft: '8px',
    },
    '.cm-completionMatchedText': {
      color: 'rgb(var(--ld-accent, 45 158 95))',
      textDecoration: 'none',
      fontWeight: '600',
    },
  },
  { dark: true }
)
