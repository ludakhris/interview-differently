// TextExhibitEditor — single textarea with markdown-lite serialisation.
// Paragraphs separated by blank lines.  Lines starting "- " become bullets.
// Lines starting "> " become a quote; last "> — " line is attribution.

import { useState } from 'react'
import type { TextExhibit, TextExhibitBlock } from '@id/types'
import { EditShell, Field, TextInput, Textarea } from './shared'

// ── Serialise TextExhibitBlock[] → markdown string ────────────────────────────

function blocksToMarkdown(blocks: TextExhibitBlock[]): string {
  return (blocks ?? []).map(b => {
    if (b.kind === 'paragraph') return b.text ?? ''
    if (b.kind === 'bullets') return (b.items ?? []).map(i => `- ${i}`).join('\n')
    if (b.kind === 'quote') {
      const lines = [`> ${b.text ?? ''}`]
      if (b.attribution) lines.push(`> — ${b.attribution}`)
      return lines.join('\n')
    }
    return ''
  }).join('\n\n')
}

// ── Deserialise markdown string → TextExhibitBlock[] ─────────────────────────

function markdownToBlocks(md: string): TextExhibitBlock[] {
  const groups = md.split(/\n\n+/).map(g => g.trim()).filter(Boolean)
  return groups.map(group => {
    const lines = group.split('\n')
    if (lines.length > 0 && lines.every(l => l.startsWith('- '))) {
      return { kind: 'bullets' as const, items: lines.map(l => l.slice(2)) }
    }
    if (lines.length > 0 && lines.every(l => l.startsWith('> '))) {
      const content = lines.map(l => l.slice(2))
      const last = content[content.length - 1]
      if (content.length > 1 && last.startsWith('— ')) {
        return { kind: 'quote' as const, text: content.slice(0, -1).join('\n'), attribution: last.slice(2) }
      }
      return { kind: 'quote' as const, text: content.join('\n') }
    }
    return { kind: 'paragraph' as const, text: group }
  })
}

// ── Editor ────────────────────────────────────────────────────────────────────

interface Props {
  exhibit: TextExhibit
  onDone: (updated: TextExhibit) => void
}

export function TextExhibitEditor({ exhibit, onDone }: Props) {
  const [title, setTitle] = useState(exhibit.title ?? '')
  const [caption, setCaption] = useState(exhibit.caption ?? '')
  const [body, setBody] = useState(blocksToMarkdown(exhibit.blocks ?? []))

  function handleDone() {
    onDone({ ...exhibit, title, caption: caption || undefined, blocks: markdownToBlocks(body) })
  }

  return (
    <EditShell emoji="📝" kindLabel="Text / Memo" onDone={handleDone}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title">
          <TextInput value={title} onChange={e => setTitle(e.target.value)} placeholder="Exhibit title" />
        </Field>
        <Field label="Caption / source">
          <TextInput value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Source: client data" />
        </Field>
      </div>

      <Field label="Content">
        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={12}
          placeholder={`Write content here.\n\nSeparate paragraphs with a blank line.\n\nStart lines with "- " for bullets:\n- First item\n- Second item\n\nStart lines with "> " for a quote:\n> The key question is not whether but when.\n> — Engagement Manager`}
        />
      </Field>

      <p className="text-[11px] text-white/25 leading-relaxed">
        Blank line = new paragraph · <code className="font-mono">- </code> = bullet list · <code className="font-mono">&gt; </code> = quote, last line <code className="font-mono">&gt; — </code> = attribution
      </p>
    </EditShell>
  )
}
