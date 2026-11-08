// Shared form primitives + EditShell chrome for all Phase C inline editors.

import type {
  ReactNode,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
} from 'react'

// ── Base input styles ─────────────────────────────────────────────────────────

export const inputCls =
  'w-full bg-surface border border-edge/12 rounded-lg px-3 py-2 text-[13px] text-ink/85 outline-hidden focus:border-primary/50 transition-colors placeholder:text-slate-mid'

// ── Primitives ────────────────────────────────────────────────────────────────

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-slate-mid">
        {label}
      </label>
      {children}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} resize-none`} />
}

export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      {...props}
      className={`${inputCls} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
    />
  )
}

export function SelectInput({
  options,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string; disabled?: boolean }[]
}) {
  return (
    <select {...rest} className={`${inputCls} cursor-pointer`}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-slate-mid">
        {label}
      </span>
      <div className="flex-1 h-px bg-ink/6" />
    </div>
  )
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] font-semibold text-primary/70 hover:text-accent border border-dashed border-primary/25 hover:border-primary/50 rounded-lg px-3 py-1.5 transition-all w-fit"
    >
      ＋ {label}
    </button>
  )
}

export function RemoveButton({
  onClick,
  title = 'Remove',
}: {
  onClick: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-[12px] text-slate-mid hover:text-red-400/70 transition-colors px-1 flex-none leading-none"
    >
      ✕
    </button>
  )
}

// ── EditShell — chrome wrapper for every editor ───────────────────────────────

export function EditShell({
  emoji,
  kindLabel,
  onDone,
  children,
}: {
  emoji: string
  kindLabel: string
  onDone: () => void
  children: ReactNode
}) {
  return (
    <div className="border border-primary/40 rounded-[14px] bg-surface-alt ring-1 ring-primary/8">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/12">
        <span className="text-[14px]">{emoji}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary/60">
          Editing {kindLabel}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 bg-primary hover:bg-accent text-on-primary text-[12px] font-bold rounded-lg transition-colors"
        >
          ✓ Done
        </button>
      </div>
      {/* Body */}
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}
