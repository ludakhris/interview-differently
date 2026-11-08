import { EditorView } from '@uiw/react-codemirror'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * Overrides the stock CodeMirror dark theme's blue-grey chrome so the editor
 * sits flush with the app's near-black panels. Syntax colours are left alone.
 */
// Colours read the same --ld-* variables as the Tailwind tokens (set only on the LTI root), with
// today's values as fallbacks.
const ink = (a: number) => `rgb(var(--ld-ink, 20 33 58) / ${a})`
const deep = 'rgb(var(--ld-surface-deep, 251 251 250))'
const raised = 'rgb(var(--ld-surface-alt, 255 255 255))'

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
      backgroundColor: `rgb(var(--ld-accent, 29 79 216) / 0.25) !important`,
    },
    '.cm-cursor': { borderLeftColor: 'rgb(var(--ld-text, 20 33 58))' },
    '.cm-placeholder': { color: `${ink(0.55)}` },
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
      color: `rgb(var(--ld-text, 20 33 58) / 0.85)`,
      padding: '3px 8px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: `rgb(var(--ld-accent, 29 79 216) / 0.25) !important`,
      color: 'rgb(var(--ld-text, 20 33 58)) !important',
    },
    '.cm-completionDetail': {
      color: `${ink(0.35)}`,
      fontStyle: 'normal',
      marginLeft: '8px',
    },
    '.cm-completionMatchedText': {
      color: 'rgb(var(--ld-accent, 29 79 216))',
      textDecoration: 'none',
      fontWeight: '600',
    },
  },
  { dark: true }
)

/**
 * SQL colours of the standalone look (blue interview/differently brand): keywords soft blue, strings
 * amber, numbers soft blue, comments muted. Only used without a tenant brand, so a branded launch keeps
 * CodeMirror's own syntax colours as before.
 */
export const brandSqlHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [tags.keyword, tags.operatorKeyword, tags.typeName], color: '#9fc2ff' },
    { tag: [tags.string, tags.special(tags.string)], color: '#ffc56b' },
    { tag: [tags.number, tags.bool, tags.null], color: '#9fc2ff' },
    { tag: [tags.function(tags.variableName), tags.standard(tags.name)], color: '#e8eaee' },
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment],
      color: '#9aa6bd',
      fontStyle: 'italic',
    },
    { tag: [tags.name, tags.propertyName, tags.variableName], color: '#e8eaee' },
    { tag: [tags.operator, tags.punctuation], color: '#c4ccda' },
  ])
)
