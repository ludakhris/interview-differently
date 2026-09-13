import { EditorView } from '@uiw/react-codemirror'

/**
 * Overrides the stock CodeMirror dark theme's blue-grey chrome so the editor
 * sits flush with the app's near-black panels. Syntax colours are left alone.
 */
export const sandboxEditorTheme = EditorView.theme(
  {
    // !important — @uiw's built-in dark theme is injected after ours.
    '&': { backgroundColor: '#0d0d0d !important' },
    '.cm-gutters': {
      backgroundColor: '#0d0d0d !important',
      borderRight: '1px solid rgba(255,255,255,0.06) !important',
      color: 'rgba(255,255,255,0.25) !important',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03) !important' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.03) !important' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(45,158,95,0.25) !important' },
    '.cm-cursor': { borderLeftColor: '#f5f3ee' },
    '.cm-placeholder': { color: 'rgba(255,255,255,0.2)' },
    // Autocomplete popup
    '.cm-tooltip': { backgroundColor: '#161616 !important', border: '1px solid rgba(255,255,255,0.12) !important', borderRadius: '8px' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { color: 'rgba(245,243,238,0.85)', padding: '3px 8px' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgba(45,158,95,0.25) !important', color: '#f5f3ee !important' },
    '.cm-completionDetail': { color: 'rgba(255,255,255,0.35)', fontStyle: 'normal', marginLeft: '8px' },
    '.cm-completionMatchedText': { color: '#2d9e5f', textDecoration: 'none', fontWeight: '600' },
  },
  { dark: true },
)
