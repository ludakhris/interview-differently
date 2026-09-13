import { forwardRef, useMemo, useRef } from 'react'
import CodeMirror, { Prec, keymap, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { sandboxEditorTheme } from '@/lib/sql/editorTheme'
import type { SchemaTable } from '@/services/datasetsService'

interface Props {
  value: string
  onChange: (v: string) => void
  onRun?: () => void // bound to Mod-Enter
  tables?: SchemaTable[] // drives schema-aware autocomplete
  height: number | string
  placeholder?: string
  readOnly?: boolean
}

/** CodeMirror SQL editor with the app theme, Postgres dialect and schema completion. */
export const SqlEditor = forwardRef<ReactCodeMirrorRef, Props>(function SqlEditor(
  { value, onChange, onRun, tables = [], height, placeholder, readOnly },
  ref,
) {
  // Keep the Mod-Enter keymap pointed at the latest `onRun` without
  // rebuilding the editor extensions on every keystroke. Prec.highest so it
  // beats the default keymap's Mod-Enter (insertBlankLine).
  const runRef = useRef(onRun)
  runRef.current = onRun
  const extensions = useMemo(
    () => [
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (runRef.current?.(), true) }])),
      sandboxEditorTheme,
      sql({ dialect: PostgreSQL, upperCaseKeywords: true, ...schemaForCompletion(tables) }),
    ],
    [tables],
  )
  const h = typeof height === 'number' ? `${height}px` : height
  return (
    <CodeMirror
      ref={ref}
      value={value}
      onChange={onChange}
      theme="dark"
      height={h}
      placeholder={placeholder}
      extensions={extensions}
      readOnly={readOnly}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: !readOnly }}
      style={{ fontSize: 13, height: h }}
    />
  )
})

// Feeds lang-sql's completion: table names (with row counts) rank above
// keywords, and `table.` / alias completion lists columns with their types.
function schemaForCompletion(tables: SchemaTable[]) {
  return {
    schema: Object.fromEntries(
      tables.map((t) => [t.table, t.columns.map((c) => ({ label: c.name, detail: c.type, type: 'property', boost: 2 }))]),
    ),
    tables: tables.map((t) => ({ label: t.table, detail: `${t.rowCount} rows`, type: 'class', boost: 3 })),
  }
}
