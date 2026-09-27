import type { OwnerOption } from '@/hooks/useOwnerOptions'

/** Owner picked in a create form: undefined until the admin chooses; null = platform-wide. */
export type OwnerChoice = string | null | undefined

// <select> values are strings, so platform (null) and "not chosen" need distinct tokens.
const PLATFORM = '__platform__'

/**
 * The owner to submit. With a single option there's nothing to choose
 * (institution-admins), otherwise it's whatever was picked — undefined
 * until then, so callers must block submit (the API would read a missing
 * owner as platform-wide).
 */
export function resolveOwner(owners: OwnerOption[], choice: OwnerChoice): OwnerChoice {
  return owners.length === 1 ? owners[0].id : choice
}

/** Owner picker with no preselection — sharing content is a deliberate choice. Renders nothing when there's no choice. */
export function OwnerSelect({
  owners,
  value,
  onChange,
  className,
  optionLabel = (o) => o.label,
}: {
  owners: OwnerOption[]
  value: OwnerChoice
  onChange: (v: OwnerChoice) => void
  className: string
  optionLabel?: (o: OwnerOption) => string
}) {
  if (owners.length <= 1) return null
  return (
    <select
      value={value === undefined ? '' : (value ?? PLATFORM)}
      onChange={(e) => onChange(e.target.value === PLATFORM ? null : e.target.value)}
      className={className}
      required
    >
      <option value="" disabled>
        Choose an owner…
      </option>
      {owners.map((o) => (
        <option key={o.id ?? PLATFORM} value={o.id ?? PLATFORM}>
          {optionLabel(o)}
        </option>
      ))}
    </select>
  )
}
