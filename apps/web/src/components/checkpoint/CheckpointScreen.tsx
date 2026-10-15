import type { CheckpointView } from '@id/types'
import { practiceGate, progress } from '@/lib/checkpoint'
import type { CheckpointClient } from '@/services/checkpointService'
import { CheckpointChat } from './CheckpointChat'
import { CheckpointPractice } from './CheckpointPractice'

/**
 * A loaded checkpoint: its title and progress, then the chat (or, for a practice slot not ready yet, what to show
 * instead). The same screen for an LTI launch from a course and a work simulation in standalone Interview
 * Differently; only the client (and so the credential) differs.
 */
export function CheckpointScreen({
  view,
  client,
  framed,
  standalone = false,
  onView,
  onSessionEnded,
}: {
  view: CheckpointView
  client: CheckpointClient
  framed: boolean
  standalone?: boolean
  onView: (view: CheckpointView) => void
  onSessionEnded: () => void
}) {
  const counts = view.tasks.length > 0 ? progress(view) : null
  const gate = practiceGate(view)
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h1
          className={`font-display font-extrabold text-fg tracking-tight ${framed ? 'text-[17px]' : 'text-[22px]'}`}
        >
          {view.title}
        </h1>
        {counts && (
          <span className="text-[12px] text-slate-mid">
            {counts.answered} of {counts.total} answered
          </span>
        )}
      </div>
      {gate ? (
        <CheckpointPractice
          view={view}
          gate={gate}
          client={client}
          onView={onView}
          onSessionEnded={onSessionEnded}
        />
      ) : (
        <CheckpointChat
          view={view}
          client={client}
          framed={framed}
          standalone={standalone}
          onView={onView}
          onSessionEnded={onSessionEnded}
        />
      )}
    </>
  )
}
