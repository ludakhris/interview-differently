// Shared form primitives + EditShell chrome for all Phase C inline editors.

import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react'

// ── Base input styles ─────────────────────────────────────────────────────────

export const inputCls =
  'w-full bg-[#0a0a0a] border border-white/12 rounded-lg px-3 py-2 text-[13px] text-white/85 outline-none focus:border-emerald-400/50 transition-colors placeholder:text-white/20'

// ── Primitives ────────────────────────────────────────────────────────────────

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</label>
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
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string; disabled?: boolean }[] }) {
  return (
    <select
      {...rest}
      className={`${inputCls} cursor-pointer`}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  )
}

export function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">{label}</span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  )
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] font-semibold text-emerald-400/70 hover:text-emerald-300 border border-dashed border-emerald-400/25 hover:border-emerald-400/50 rounded-lg px-3 py-1.5 transition-all w-fit"
    >
      ＋ {label}
    </button>
  )
}

export function RemoveButton({ onClick, title = 'Remove' }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-[12px] text-white/20 hover:text-red-400/70 transition-colors px-1 flex-none leading-none"
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
    <div className="border border-emerald-400/40 rounded-[14px] bg-[#0d1a12] ring-1 ring-emerald-400/[0.08]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-400/[0.12]">
        <span className="text-[14px]">{emoji}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300/60">
          Editing {kindLabel}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[12px] font-bold rounded-lg transition-colors"
        >
          ✓ Done
        </button>
      </div>
      {/* Body */}
      <div className="p-4 flex flex-col gap-4">
        {children}
      </div>
    </div>
  )
}
