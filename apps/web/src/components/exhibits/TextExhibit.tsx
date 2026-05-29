// text-exhibit. Rich text passage built from typed blocks: paragraphs,
// bullet lists, attributed quotes. Useful for dialogue snippets, market
// context, study findings, regulatory excerpts.

import type { TextExhibit as TextExhibitType, TextExhibitBlock } from '@id/types'
import { ExhibitShell } from './ExhibitShell'

export function TextExhibit({ exhibit }: { exhibit: TextExhibitType }) {
  return (
    <ExhibitShell
      title={exhibit.title}
      caption={exhibit.caption}
      footnote={exhibit.footnote}
      badge="Text"
    >
      <div className="space-y-3">
        {exhibit.blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
    </ExhibitShell>
  )
}

function Block({ block }: { block: TextExhibitBlock }) {
  if (block.kind === 'paragraph') {
    return (
      <p className="text-[13px] text-[#f5f3ee]/85 leading-relaxed">{block.text}</p>
    )
  }
  if (block.kind === 'bullets') {
    return (
      <ul className="space-y-1.5 pl-4 list-disc marker:text-white/30">
        {(block.items ?? []).map((it, i) => (
          <li key={i} className="text-[13px] text-[#f5f3ee]/85 leading-relaxed">
            {it}
          </li>
        ))}
      </ul>
    )
  }
  // quote
  return (
    <blockquote className="border-l-2 border-[#4ea58a] pl-3 py-1">
      <p className="text-[13px] italic text-[#f5f3ee]/85 leading-relaxed">
        “{block.text}”
      </p>
      {block.attribution && (
        <p className="mt-1.5 text-[11px] text-white/45">— {block.attribution}</p>
      )}
    </blockquote>
  )
}
