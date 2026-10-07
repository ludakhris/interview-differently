import { useId, useState } from 'react'
import { addItems } from './profileForm'
import './talent.css'

/**
 * A list of short items typed one at a time: Enter or a comma adds the text, a chip's x removes it.
 * Suggestions are one-tap shortcuts; anything else can be typed freely. Never a comma-separated box.
 */
export function ChipInput(props: {
  label: string
  hint?: string
  error?: string
  value: string[]
  onChange: (next: string[]) => void
  suggestions: string[]
  placeholder?: string
}) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [props.hint ? hintId : '', props.error ? errId : ''].filter(Boolean).join(' ')

  const commit = (raw: string[]) => {
    const next = addItems(props.value, raw)
    if (next.length !== props.value.length) props.onChange(next)
    setDraft('')
  }
  const remaining = props.suggestions.filter(
    (s) => !props.value.some((v) => v.toLowerCase() === s.toLowerCase())
  )
  return (
    <div className="dash-field tl-chipfield" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`}>{props.label}</span>
      {props.value.length > 0 && (
        <ul className="tl-taglist">
          {props.value.map((item) => (
            <li key={item} className="tl-tagitem">
              <span>{item}</span>
              <button
                type="button"
                className="tl-tagx"
                aria-label={`Remove ${item}`}
                onClick={() => props.onChange(props.value.filter((x) => x !== item))}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        value={draft}
        autoComplete="off"
        placeholder={props.placeholder ?? 'Type one and press Enter'}
        aria-label={`Add to ${props.label.toLowerCase()}`}
        aria-describedby={describedBy || undefined}
        aria-invalid={!!props.error}
        onChange={(e) => {
          const v = e.target.value
          if (v.includes(',')) commit(v.split(','))
          else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Enter adds the item; it must not submit the whole form.
            e.preventDefault()
            commit([draft])
          } else if (e.key === 'Backspace' && draft === '' && props.value.length > 0) {
            props.onChange(props.value.slice(0, -1))
          }
        }}
        onBlur={() => draft.trim() && commit([draft])}
      />
      {remaining.length > 0 && (
        <div className="tl-suggest" role="group" aria-label={`Suggested: ${props.label}`}>
          <span className="dash-muted">Common ones:</span>
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              className="tl-suggest-btn"
              onClick={() => props.onChange(addItems(props.value, [s]))}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      {props.hint && (
        <small id={hintId} className="dash-hint">
          {props.hint}
        </small>
      )}
      {props.error && (
        <small id={errId} className="dash-error">
          {props.error}
        </small>
      )}
    </div>
  )
}
