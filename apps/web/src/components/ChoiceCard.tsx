interface Props {
  id: string
  text: string
  selected: boolean
  onSelect: (id: string) => void
}

export function ChoiceCard({ id, text, selected, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(id)}
      className={`
        choice-card w-full text-left flex items-start gap-4
        rounded-xl border-2 px-5 py-4 cursor-pointer
        transition-all duration-150
        ${selected
          ? 'border-green bg-green/10'
          : 'border-white/10 bg-[#111111] hover:border-white/25'
        }
      `}
    >
      <span
        className={`
          flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
          font-display font-bold text-[13px] transition-colors
          ${selected ? 'bg-green text-white' : 'bg-white/10 text-slate-light'}
        `}
      >
        {id}
      </span>
      <span className={`text-[14px] leading-relaxed pt-0.5 ${selected ? 'text-[#f5f3ee] font-medium' : 'text-slate-light'}`}>
        {text}
      </span>
    </button>
  )
}
