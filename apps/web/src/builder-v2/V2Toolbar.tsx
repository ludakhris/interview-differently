// V2Toolbar — top bar for the document editor.
// Editable title, save status, Preview / Advanced / Publish actions.

import { useState } from 'react'
import type { SaveStatus } from '@/hooks/useBuilderDoc'
import { useNavigate } from 'react-router-dom'

interface Props {
  scenarioId: string
  title: string
  saveStatus: SaveStatus
  /** Institution name for private scenarios; null = public (#15). */
  institutionName: string | null
  status: 'draft' | 'published'
  onPublish: () => void
  onTitleChange: (title: string) => void
  onSave: () => void
  onPreview: () => void
}

export function V2Toolbar({ scenarioId, title, saveStatus, institutionName, status, onPublish, onTitleChange, onSave, onPreview }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const navigate = useNavigate()

  function commitTitle() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== title) onTitleChange(trimmed)
    setEditing(false)
  }

  const statusLabel =
    saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved' : 'Saved'
  const statusClass =
    saveStatus === 'saved'
      ? 'text-emerald-400/80 bg-emerald-400/10 border-emerald-400/25'
      : saveStatus === 'saving'
      ? 'text-white/40 bg-white/5 border-white/10 animate-pulse'
      : 'text-amber-400/80 bg-amber-400/10 border-amber-400/25'

  return (
    <div className="flex items-center gap-3 px-4 h-[52px] flex-none border-b border-white/10 bg-[#0d0d0d]">
      {/* Logo mark */}
      <span className="text-emerald-500 text-[15px] font-bold flex-none">◆</span>

      {/* Title */}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditing(false) }}
          className="text-[14px] font-semibold bg-transparent border-b border-emerald-400/60 outline-none text-white min-w-[200px] max-w-[360px] pb-px"
        />
      ) : (
        <button
          onClick={() => { setDraft(title); setEditing(true) }}
          className="text-[14px] font-semibold text-white/90 hover:text-white truncate max-w-[360px] text-left"
        >
          {title}
        </button>
      )}

      <span
        title={institutionName ? `Only ${institutionName} members can see this scenario` : 'Visible to every user'}
        className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex-none ${
          institutionName ? 'bg-green/20 text-green-light' : 'bg-white/10 text-white/50'
        }`}
      >
        {institutionName ?? 'Public'}
      </span>

      <div className="flex-1" />

      {/* Save status */}
      <button
        onClick={onSave}
        className={`text-[11px] font-semibold border rounded-full px-2.5 py-0.5 transition-all ${statusClass}`}
      >
        {statusLabel}
      </button>

      {/* Preview */}
      <button
        onClick={onPreview}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-white/65 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-all"
      >
        ▶ Preview as candidate
      </button>

      {/* Advanced (graph) */}
      <button
        onClick={() => navigate(`/builder/${scenarioId}/advanced`)}
        className="text-[12px] font-semibold text-white/35 hover:text-white/60 transition-colors"
        title="Open the graph canvas (advanced)"
      >
        Advanced ↗
      </button>

      {/* Status + Publish */}
      <span
        title={status === 'published' ? 'Candidates see the last published version. Re-publish to push your edits.' : 'Not visible to candidates yet'}
        className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex-none ${
          status === 'published' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'
        }`}
      >
        {status}
      </span>
      <button
        onClick={onPublish}
        className="text-[13px] font-bold bg-emerald-600 hover:bg-emerald-500 text-black rounded-lg px-4 py-1.5 whitespace-nowrap transition-colors"
      >
        {status === 'published' ? 'Re-publish' : 'Publish'}
      </button>
    </div>
  )
}
