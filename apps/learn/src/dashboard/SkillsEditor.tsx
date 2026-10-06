import type { CourseSkill } from '@id/types'
import { useState } from 'react'

/** The course's skills as chips: a name and a pass mark each, added one at a time. */
export function SkillsEditor(props: {
  skills: CourseSkill[]
  onChange: (skills: CourseSkill[]) => void
}) {
  const { skills, onChange } = props
  const [name, setName] = useState('')
  const [pct, setPct] = useState('70')
  const [error, setError] = useState<string | null>(null)

  function add() {
    const label = name.trim()
    const mark = Number(pct)
    if (!label) return setError('Give the skill a name.')
    if (!Number.isInteger(mark) || mark < 1 || mark > 100)
      return setError('The pass mark is a whole number from 1 to 100.')
    if (skills.some((s) => s.label.toLowerCase() === label.toLowerCase()))
      return setError(`"${label}" is already a skill.`)
    if (skills.length >= 12) return setError('A course can have up to 12 skills.')
    setError(null)
    onChange([...skills, { id: '', label, targetPct: mark }])
    setName('')
    setPct('70')
  }

  return (
    <div className="dash-field">
      <span id="skills-label">Skills this course builds</span>
      {skills.length > 0 && (
        <ul className="dash-skill-chips" aria-labelledby="skills-label">
          {skills.map((s, i) => (
            <li key={`${s.label}-${i}`} className="dash-skill-chip">
              <span>{s.label}</span>
              <input
                type="number"
                min={1}
                max={100}
                value={s.targetPct}
                aria-label={`Pass mark for ${s.label}`}
                onChange={(e) =>
                  onChange(
                    skills.map((x, j) =>
                      j === i ? { ...x, targetPct: Number(e.target.value) } : x
                    )
                  )
                }
              />
              <span aria-hidden="true">%</span>
              <button
                type="button"
                aria-label={`Remove ${s.label}`}
                onClick={() => onChange(skills.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dash-skill-add">
        <input
          value={name}
          maxLength={60}
          placeholder="Skill name, for example Workplace safety"
          aria-label="Skill name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <input
          type="number"
          min={1}
          max={100}
          value={pct}
          aria-label="Pass mark in percent"
          onChange={(e) => setPct(e.target.value)}
        />
        <span aria-hidden="true">%</span>
        <button type="button" className="dash-btn-secondary" onClick={add}>
          Add skill
        </button>
      </div>
      {error && <small className="dash-error">{error}</small>}
      <small className="dash-muted">
        Tag quiz questions and practice interviews with a skill. A learner who falls below its pass
        mark has the content you set up for it added to their plan, and must finish that to complete
        the course. Tag at least three questions per skill so one slip does not add work.
      </small>
    </div>
  )
}
