import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { refractor } from 'refractor/core'
import dax from 'refractor/dax'
import sql from 'refractor/sql'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'

/**
 * Scenario question prompts (#25): markdown with GFM tables, and ``` fences
 * highlighted with Prism grammars. Only the languages assessments use are
 * registered; any other fence renders as plain mono. Token colours: index.css.
 * Prose uses the theme tokens; the table and code boxes are deliberately dark and set their own
 * text colours so they stay readable on a light brand.
 */

refractor.register(sql)
refractor.register(dax)

const components: Components = {
  p: ({ children }) => <p>{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
  // A data exhibit: framed, tinted header, zebra rows, right-aligned columns in mono.
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-xl border border-edge/15 bg-surface-alt">
      <table className="w-full text-[13.5px] tabular-nums">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-primary/10">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b border-edge/[0.07] last:border-0 even:bg-ink/3 hover:bg-ink/5 transition-colors">
      {children}
    </tr>
  ),
  th: ({ children, style }) => (
    <th
      style={style}
      className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-fg border-b border-primary/30 whitespace-nowrap"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td
      style={style}
      className={`px-4 py-1.5 whitespace-nowrap first:font-medium first:text-fg text-slate-light ${style?.textAlign === 'right' ? 'font-mono text-[13px] text-fg' : ''}`}
    >
      {children}
    </td>
  ),
  pre: ({ children }) => (
    <pre className="sim-dark font-mono text-[13px] text-fg bg-surface-deep border border-edge/10 rounded-lg px-4 py-3 overflow-x-auto [scrollbar-color:rgb(255_255_255/0.15)_transparent]">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const lang = /language-(\w+)/.exec(className ?? '')?.[1]
    const text = String(children ?? '')
    if (!className && !text.includes('\n')) {
      return (
        <code className="font-mono text-[13px] bg-ink/8 px-1.5 py-0.5 rounded-sm text-fg">
          {children}
        </code>
      )
    }
    if (lang && refractor.registered(lang)) {
      return (
        <code>
          {toJsxRuntime(refractor.highlight(text.replace(/\n$/, ''), lang), {
            Fragment,
            jsx,
            jsxs,
          })}
        </code>
      )
    }
    return <code>{children}</code>
  },
}

export function PromptMarkdown({ text }: { text: string }) {
  return (
    <div className="prompt-md space-y-3">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  )
}
