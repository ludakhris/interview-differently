import { AlertTriangle, BarChart3, Scale } from 'lucide-react'
import type { LucideProps } from 'lucide-react'

const icons: Record<string, React.FC<LucideProps>> = {
  AlertTriangle,
  BarChart3,
  Scale,
}

interface Props extends LucideProps {
  name: string
}

export function TrackIcon({ name, ...props }: Props) {
  const Icon = icons[name]
  if (!Icon) return null
  return <Icon {...props} />
}
