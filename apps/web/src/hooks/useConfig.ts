import { useEffect, useState } from 'react'
import { fetchConfig, type PublicConfig } from '@/services/configService'

const DEFAULT_CONFIG: PublicConfig = { aiFeedbackEnabled: true }

export function useConfig() {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {/* use default */})
  }, [])

  return config
}
