import type { ReviewSection } from '@/services/assessmentsService'

/**
 * Per-question review of a submitted attempt: the prompt, what was answered, whether it was right,
 * and the key. Shared by the learner's result page and the admin's per-attempt view.
 */
export function AttemptReview({ review }: { review: ReviewSection[] }) {
  return (
    <div className="space-y-6">
      {review.map((s) => (
        <section
          key={s.sectionId}
          className="bg-surface-deep rounded-2xl border border-edge/10 p-6"
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-mid mb-4">
            {s.title}
          </p>
          <ol className="space-y-5">
            {s.questions.map((q) => (
              <li key={q.id} className="border-t border-edge/10 pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 text-[11px] font-bold uppercase tracking-widest flex-shrink-0 ${q.correct ? 'text-green-light' : 'text-red-400'}`}
                  >
                    {q.correct ? 'Correct' : 'Wrong'}
                  </span>
                  <p className="text-[13px] text-fg whitespace-pre-wrap">{q.prompt}</p>
                </div>
                {q.options ? (
                  <ul className="mt-2 ml-[62px] space-y-1">
                    {q.options.map((o) => {
                      const picked = q.answer.trim().toUpperCase() === o.key
                      const key = q.correctAnswer === o.key
                      return (
                        <li
                          key={o.key}
                          className={`text-[12px] ${key ? 'text-green-light' : picked ? 'text-red-400' : 'text-slate-light'}`}
                        >
                          {o.key}. {o.text}
                          {picked && ' · your answer'}
                          {key && ' · correct answer'}
                        </li>
                      )
                    })}
                    {!q.answer.trim() && (
                      <li className="text-[12px] text-red-400">No answer given</li>
                    )}
                  </ul>
                ) : (
                  <div className="mt-2 ml-[62px] space-y-2">
                    <Code label="Your query" text={q.answer.trim() ? q.answer : '(no answer)'} />
                    {q.error && <p className="text-[12px] text-red-400">{q.error}</p>}
                    {!q.correct && <Code label="Reference query" text={q.correctAnswer} />}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function Code({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-mid mb-1">{label}</p>
      <pre className="text-[12px] font-mono text-slate-light bg-surface rounded-lg border border-edge/10 p-3 overflow-x-auto whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  )
}
