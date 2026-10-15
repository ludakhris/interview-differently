import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessagesSquare } from 'lucide-react'
import type { CheckpointSimulation } from '@id/types'
import { fetchSimulations, startSimulation, type GetToken } from '@/services/checkpointService'

/** What a card says about where the learner is in it. */
export function simulationStatus(s: CheckpointSimulation): string {
  if (s.done) return s.scorePct === null ? 'Done' : `Done · ${s.scorePct}% right`
  if (s.answered > 0) return `${s.answered} of ${s.requests} answered`
  return `${s.requests} ${s.requests === 1 ? 'request' : 'requests'}`
}

/** The signed-in learner's work simulations (GitHub issue #90); empty when signed out or on an error. */
export function useWorkSimulations(getToken: GetToken, enabled: boolean): CheckpointSimulation[] {
  const [sims, setSims] = useState<CheckpointSimulation[]>([])
  useEffect(() => {
    if (!enabled) return
    fetchSimulations(getToken)
      .then(setSims)
      .catch(() => {
        /* non-critical: the cards stay hidden */
      })
  }, [getToken, enabled])
  return sims
}

/** The competency profile rows from every simulation, one per skill name (averaged if two banks share one). */
export function simulationCompetencies(
  sims: CheckpointSimulation[]
): { dimension: string; averageScore: number }[] {
  const byName = new Map<string, number[]>()
  for (const c of sims.flatMap((s) => s.competencies)) {
    byName.set(c.name, [...(byName.get(c.name) ?? []), c.score])
  }
  return Array.from(byName, ([dimension, scores]) => ({
    dimension,
    averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }))
}

/**
 * Work simulation cards for the Data Analytics track's grid (GitHub issue #90): colleagues send data requests in a
 * chat and the learner answers each with a query, the same chat a course opens by LTI.
 */
export function WorkSimulationCards({
  sims,
  getToken,
  color,
}: {
  sims: CheckpointSimulation[]
  getToken: GetToken
  color: string
}) {
  const navigate = useNavigate()
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const open = async (bankSlug: string) => {
    if (opening) return
    setOpening(bankSlug)
    setError(null)
    try {
      const { deliveryId } = await startSimulation(getToken, bankSlug)
      navigate(`/simulations/${encodeURIComponent(deliveryId)}`)
    } catch (e) {
      setError((e as Error).message)
      setOpening(null)
    }
  }

  return (
    <>
      {error && (
        <p className="col-span-full text-[13px] text-red-400" role="alert">
          We could not open it. {error}
        </p>
      )}
      {sims.map((s) => (
        <button
          key={s.bankSlug}
          type="button"
          disabled={opening !== null}
          onClick={() => void open(s.bankSlug)}
          className="text-left bg-[#111111] rounded-2xl border border-white/10 hover:border-white/20 transition-all hover:-translate-y-0.5 overflow-hidden group disabled:opacity-60"
        >
          <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
          <div className="p-5">
            <div className="flex items-start gap-3 mb-2">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${color}22`, color }}
              >
                <MessagesSquare size={20} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
                  Chat with your team
                </p>
                <h4 className="mt-0.5 font-display font-bold text-[15px] text-[#f5f3ee] leading-snug">
                  {s.title}
                </h4>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-light">{simulationStatus(s)}</span>
              <span
                className="text-[11px] font-semibold group-hover:translate-x-1 transition-transform inline-block"
                style={{ color }}
              >
                {opening === s.bankSlug
                  ? 'Opening…'
                  : s.done
                    ? 'Review →'
                    : s.answered > 0
                      ? 'Continue →'
                      : 'Start →'}
              </span>
            </div>
          </div>
        </button>
      ))}
    </>
  )
}
