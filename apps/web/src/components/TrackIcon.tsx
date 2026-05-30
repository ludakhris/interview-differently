import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  GraduationCap,
  Landmark,
  Pill,
  Plug,
  Scale,
  Store,
  Truck,
  Users,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'

// Map of every lucide icon we render through the TrackIcon API. Keep keys
// in PascalCase to match the lucide import names; per-scenario `icon` strings
// in YAML use these keys.
const icons: Record<string, React.FC<LucideProps>> = {
  AlertTriangle,
  BarChart3,
  Briefcase,
  GraduationCap,
  Landmark,
  Pill,
  Plug,
  Scale,
  Store,
  Truck,
  Users,
}

interface Props extends LucideProps {
  name: string
}

export function TrackIcon({ name, ...props }: Props) {
  const Icon = icons[name]
  if (!Icon) return null
  return <Icon {...props} />
}
