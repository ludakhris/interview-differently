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
 */

refractor.register(sql)
refractor.register(dax)

const components: Components = {
  p: ({ children }) => <p>{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-[#f5f3ee]">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
  // A data exhibit: framed, green header, zebra rows, right-aligned columns in mono.
  table: ({ children }) => (
    <div className="overflow-x-auto [scrollbar-color:rgb(255_255_255/0.15)_transparent] rounded-xl border border-white/15 bg-[#141414] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.8)]">
      <table className="w-full text-[13.5px] tabular-nums">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#1a6b3c]/25">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b border-white/[0.07] last:border-0 even:bg-white/[0.03] hover:bg-white/[0.05] transition-colors">{children}</tr>
  ),
  th: ({ children, style }) => (
    <th style={style} className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#8fd6ad] border-b border-[#2d9e5f]/40 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td
      style={style}
      className={`px-4 py-1.5 whitespace-nowrap first:font-medium first:text-[#f5f3ee] text-white/80 ${style?.textAlign === 'right' ? 'font-mono text-[13px] text-[#f5f3ee]' : ''}`}
    >
      {children}
    </td>
  ),
  pre: ({ children }) => (
    <pre className="font-mono text-[13px] bg-[#0d0d0d] border border-white/10 rounded-lg px-4 py-3 overflow-x-auto [scrollbar-color:rgb(255_255_255/0.15)_transparent]">{children}</pre>
  ),
  code: ({ className, children }) => {
    const lang = /language-(\w+)/.exec(className ?? '')?.[1]
    const text = String(children ?? '')
    if (!className && !text.includes('\n')) {
      return <code className="font-mono text-[13px] bg-white/8 px-1.5 py-0.5 rounded text-[#f5f3ee]">{children}</code>
    }
    if (lang && refractor.registered(lang)) {
      return <code>{toJsxRuntime(refractor.highlight(text.replace(/\n$/, ''), lang), { Fragment, jsx, jsxs })}</code>
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
