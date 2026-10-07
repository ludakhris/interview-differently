import { useEffect, useId, useRef, useState } from 'react'
import { addItems } from './profileForm'
import './talent.css'

/**
 * A list of short items typed one at a time: Enter, a comma or the Add button adds the text, a
 * chip's x removes it. Suggestions are one-tap shortcuts and form ONE tab stop (a roving group:
 * arrow keys move, Enter or Space adds). Never a comma-separated box.
 */
export function ChipInput(props: {
  label: string
  /** Visible tag beside the label, for example "Needed" or "Optional". */
  tag?: string
  error?: string
  value: string[]
  onChange: (next: string[]) => void
  suggestions: string[]
  placeholder?: string
  /** Overrides the generated id of the text box, so an error summary can link to it. */
  inputId?: string
}) {
  const generated = useId()
  const id = props.inputId ?? generated
  const [draft, setDraft] = useState('')
  const [active, setActive] = useState(0)
  const btns = useRef<(HTMLButtonElement | null)[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const pending = useRef<number | null>(null)
  const hintId = `${id}-hint`
  const keysId = `${id}-keys`
  const tagId = `${id}-tag`
  const errId = `${id}-err`
  const describedBy = [props.tag ? tagId : '', hintId, props.error ? errId : '']
    .filter(Boolean)
    .join(' ')

  const commit = (raw: string[]) => {
    const next = addItems(props.value, raw)
    if (next.length !== props.value.length) props.onChange(next)
    setDraft('')
  }
  const remaining = props.suggestions.filter(
    (s) => !props.value.some((v) => v.toLowerCase() === s.toLowerCase())
  )
  const cur = Math.min(active, Math.max(remaining.length - 1, 0))

  // After a suggestion is added its button is gone: keep focus in the group, or go back to the box.
  useEffect(() => {
    if (pending.current === null) return
    const at = Math.min(pending.current, remaining.length - 1)
    pending.current = null
    if (at < 0) inputRef.current?.focus()
    else btns.current[at]?.focus()
  }, [remaining.length])

  const move = (to: number) => {
    const n = (to + remaining.length) % remaining.length
    setActive(n)
    btns.current[n]?.focus()
  }

  return (
    <div className="dash-field tl-chipfield" role="group" aria-labelledby={`${id}-label`}>
      <span className="tl-labelrow">
        <span id={`${id}-label`} className="tl-label">
          {props.label}
        </span>
        {props.tag && (
          <span id={tagId} className={props.tag === 'Optional' ? 'tl-opt' : 'tl-need'}>
            {props.tag}
          </span>
        )}
      </span>
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
      <div className="tl-addrow">
        <input
          ref={inputRef}
          id={id}
          value={draft}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={props.placeholder ?? 'Type one'}
          aria-label={`Add to ${props.label.toLowerCase()}`}
          aria-describedby={describedBy}
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
        <button
          type="button"
          className="dash-btn-secondary tl-addbtn"
          aria-label={`Add typed item to ${props.label.toLowerCase()}`}
          onClick={() => {
            commit([draft])
            inputRef.current?.focus()
          }}
        >
          Add
        </button>
      </div>
      {remaining.length > 0 && (
        <div
          className="tl-suggest"
          role="group"
          aria-label={`Suggested: ${props.label}`}
          aria-describedby={keysId}
        >
          {remaining.map((s, i) => (
            <button
              key={s}
              ref={(el) => {
                btns.current[i] = el
              }}
              type="button"
              className="tl-suggest-btn"
              tabIndex={i === cur ? 0 : -1}
              onFocus={() => setActive(i)}
              onClick={() => {
                pending.current = i
                props.onChange(addItems(props.value, [s]))
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  move(i + 1)
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  move(i - 1)
                } else if (e.key === 'Home') {
                  e.preventDefault()
                  move(0)
                } else if (e.key === 'End') {
                  e.preventDefault()
                  move(remaining.length - 1)
                }
              }}
            >
              + {s}
            </button>
          ))}
          <span id={keysId} className="dash-visually-hidden">
            Suggestions are one group. Use the arrow keys to move between them, and Enter or Space
            to add one. Tab moves on to the next field.
          </span>
        </div>
      )}
      <small id={hintId} className="dash-hint">
        Tap a suggestion or type your own
      </small>
      {props.error && (
        <small id={errId} className="dash-error">
          {props.error}
        </small>
      )}
    </div>
  )
}
