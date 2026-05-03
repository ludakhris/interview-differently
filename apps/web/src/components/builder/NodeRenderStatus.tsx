import { useEffect, useState } from 'react'
import type { ScenarioMediaAsset } from '@id/types'
import { renderNodeMedia, sha256Hex } from '@/services/scenarioMediaService'

type Status = 'not-rendered' | 'ready' | 'stale' | 'failed' | 'rendering'

interface NodeRenderStatusProps {
  scenarioId: string
  nodeId: string
  audioScript: string
  asset: ScenarioMediaAsset | null
  /** Called after a successful render so the parent can refresh its asset list. */
  onRendered: (asset: ScenarioMediaAsset) => void
}

export function NodeRenderStatus({ scenarioId, nodeId, audioScript, asset, onRendered }: NodeRenderStatusProps) {
  const [currentHash, setCurrentHash] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!audioScript.trim()) {
      setCurrentHash(null)
      return
    }
    sha256Hex(audioScript.trim()).then(h => { if (!cancelled) setCurrentHash(h) })
    return () => { cancelled = true }
  }, [audioScript])

  const status: Status = (() => {
    if (rendering) return 'rendering'
    if (!asset) return 'not-rendered'
    if (asset.status === 'failed') return 'failed'
    if (asset.status === 'rendering') return 'rendering'
    if (asset.status === 'ready' && currentHash && asset.scriptHash !== currentHash) return 'stale'
    if (asset.status === 'ready') return 'ready'
    return 'not-rendered'
  })()

  async function handleRender() {
    setError(null)
    setRendering(true)
    try {
      const next = await renderNodeMedia(scenarioId, nodeId)
      onRendered(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed')
    } finally {
      setRendering(false)
    }
  }

  const buttonLabel = status === 'ready' ? 'Re-render' : status === 'rendering' ? 'Rendering…' : 'Render'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        <button
          onClick={handleRender}
          disabled={rendering || !audioScript.trim()}
          className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {buttonLabel}
        </button>
      </div>

      {asset?.mediaUrl && status === 'ready' && (
        <video
          key={asset.mediaUrl}
          src={asset.mediaUrl}
          controls
          className="w-full rounded-lg bg-black/50"
        />
      )}

      {(error || (asset?.status === 'failed' && asset.errorMessage)) && (
        <p className="text-[10px] text-red-400 leading-relaxed">
          {error ?? asset?.errorMessage}
        </p>
      )}

      {status === 'stale' && !error && (
        <p className="text-[10px] text-amber-400/80 leading-relaxed">
          Audio script changed since last render. Re-render before publishing.
        </p>
      )}

      {status === 'rendering' && (
        <p className="text-[10px] text-white/40 leading-relaxed">
          D-ID is rendering — typically 30–60 seconds. Don't navigate away.
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const config = {
    'ready':        { dot: '#2d9e5f', label: 'RENDERED' },
    'stale':        { dot: '#d4830a', label: 'STALE'    },
    'rendering':    { dot: '#1a5a8a', label: 'RENDERING' },
    'failed':       { dot: '#c0392b', label: 'FAILED'   },
    'not-rendered': { dot: 'rgba(255,255,255,0.3)', label: 'NOT RENDERED' },
  }[status]

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/10 bg-[#111111]">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: config.dot }} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
        {config.label}
      </span>
    </span>
  )
}
