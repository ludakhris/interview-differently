import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'

export type SaveStatus = 'saved' | 'unsaved' | 'saving'

interface BuilderToolbarProps {
  title: string
  saveStatus: SaveStatus
  onSave?: () => void
  onTitleChange: (title: string) => void
  onRubricOpen: () => void
  onPreview: () => void
  onPublish: () => void
}

export function BuilderToolbar({
  title,
  saveStatus,
  onSave,
  onTitleChange,
  onRubricOpen,
  onPreview,
  onPublish,
}: BuilderToolbarProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    setDraft(title)
  }, [title])

  function handleBlur() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== title) {
      onTitleChange(trimmed)
    } else {
      setDraft(title)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      ;(e.currentTarget as HTMLInputElement).blur()
    }
    if (e.key === 'Escape') {
      setDraft(title)
      setEditing(false)
    }
  }

  const statusConfig = {
    saved: { label: 'Saved', color: '#2d9e5f' },
    unsaved: { label: 'Unsaved changes', color: '#d4830a' },
    saving: { label: 'Saving…', color: 'rgba(255,255,255,0.4)' },
  }
  const status = statusConfig[saveStatus]

  return (
    <header className="flex items-center justify-between px-5 py-3 bg-[#0d0d0d] border-b border-white/10 flex-shrink-0 z-10">
      {/* Left */}
      <div className="flex items-center gap-4">
        <Link
          to="/builder"
          className="text-[12px] text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5"
        >
          <span>←</span>
          <span>Scenarios</span>
        </Link>

        <span className="text-white/10">|</span>

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="bg-[#111111] border border-white/20 rounded-md px-3 py-1 text-[14px] font-semibold text-[#f5f3ee] focus:outline-none focus:border-white/40 min-w-[200px]"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-[14px] font-semibold text-[#f5f3ee] hover:text-white transition-colors px-1 rounded hover:bg-white/5"
            title="Click to edit title"
          >
            {title || 'Untitled Scenario'}
          </button>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <button
          onClick={saveStatus === 'unsaved' ? onSave : undefined}
          className="text-[11px] font-medium transition-opacity"
          style={{ color: status.color, cursor: saveStatus === 'unsaved' ? 'pointer' : 'default' }}
          title={saveStatus === 'unsaved' ? 'Click to save' : undefined}
        >
          {status.label}
        </button>

        <button
          onClick={onRubricOpen}
          className="text-[12px] font-medium text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-all"
        >
          Rubric
        </button>

        <button
          onClick={onPreview}
          className="text-[12px] font-medium text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-all"
        >
          Preview
        </button>

        <button
          onClick={onPublish}
          className="text-[12px] font-semibold text-white bg-[#1a6b3c] hover:bg-[#2d9e5f] rounded-lg px-4 py-1.5 transition-colors"
        >
          Publish
        </button>
      </div>
    </header>
  )
}
