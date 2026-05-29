// profit-tree exhibit. Drillable issue-tree where every branch shows a
// label, an optional value, and an optional formula. Levels can be
// collapsed/expanded; root always renders expanded.

import { useState } from 'react'
import type { ProfitTreeExhibit, ProfitTreeNode } from '@id/types'
import { ExhibitShell } from './ExhibitShell'
import { toneText } from './tokens'

export function ProfitTree({ exhibit }: { exhibit: ProfitTreeExhibit }) {
  return (
    <ExhibitShell
      title={exhibit.title}
      caption={exhibit.caption}
      footnote={exhibit.footnote}
      badge="Tree"
    >
      <div>
        <TreeNode node={exhibit.root} depth={0} isLast />
      </div>
    </ExhibitShell>
  )
}

interface TreeNodeProps {
  node: ProfitTreeNode
  depth: number
  isLast: boolean
}

function TreeNode({ node, depth }: TreeNodeProps) {
  const [open, setOpen] = useState(depth < 2) // first two levels open by default
  const hasChildren = (node.children?.length ?? 0) > 0
  const tone = node.tone ?? 'neutral'

  return (
    <div className={depth === 0 ? '' : 'pl-4 border-l border-white/10 ml-1'}>
      <button
        type="button"
        className={`group flex items-baseline gap-2 w-full text-left py-1.5 rounded hover:bg-white/3 px-1 -mx-1 ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={() => hasChildren && setOpen(o => !o)}
        aria-expanded={hasChildren ? open : undefined}
      >
        {hasChildren ? (
          <span className="text-[10px] text-white/40 w-3 flex-shrink-0">
            {open ? '▾' : '▸'}
          </span>
        ) : (
          <span className="w-3 flex-shrink-0 text-white/20 text-[10px]">·</span>
        )}
        <span className={`text-[12px] font-medium ${toneText[tone]} flex-1`}>
          {node.label}
        </span>
        {node.value && (
          <span className={`text-[13px] font-display font-bold ${toneText[tone]}`}>
            {node.value}
          </span>
        )}
      </button>
      {node.formula && open && (
        <p className="ml-5 text-[11px] text-white/40 font-mono leading-snug py-0.5">
          {node.formula}
        </p>
      )}
      {hasChildren && open && (
        <div className="mt-0.5">
          {node.children!.map((child, i) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={i === node.children!.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
