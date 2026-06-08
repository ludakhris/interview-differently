// useBuilderDoc — single-source-of-truth state for the v2 document editor.
//
// Owns the Scenario blob; all mutations go through typed patch functions that
// produce a new immutable Scenario. Debounced autosave (800 ms) to the same
// PUT /api/scenarios/:id endpoint used by the canvas builder.
//
// No ReactFlow dependency — phase order carries the flow.

import { useState, useCallback, useRef, useEffect } from 'react'
import type { Scenario, ScenarioPhase, Exhibit, ScenarioNode } from '@id/types'
import { updateScenario } from '@/services/builderService'

export type SaveStatus = 'saved' | 'saving' | 'unsaved'

export function useBuilderDoc(initial: Scenario | null) {
  const [scenario, setScenario] = useState<Scenario | null>(initial)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scenarioRef = useRef(scenario)
  scenarioRef.current = scenario

  // Sync when the initial prop loads asynchronously (parent fetches + passes down)
  useEffect(() => {
    if (initial && !scenario) {
      setScenario(initial)
      setSaveStatus('saved')
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave on unmount if dirty
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      const s = scenarioRef.current
      if (s) updateScenario(s).catch(() => {/* ignore */})
    }
  }, [])

  const patch = useCallback((updater: (prev: Scenario) => Scenario) => {
    setScenario(prev => {
      if (!prev) return prev
      const next = updater(prev)
      setSaveStatus('unsaved')
      // Debounced save
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setSaveStatus('saving')
        updateScenario(next)
          .then(() => setSaveStatus('saved'))
          .catch(() => setSaveStatus('unsaved'))
      }, 800)
      return next
    })
  }, [])

  // ── Title ──────────────────────────────────────────────────────────────────
  const setTitle = useCallback((title: string) => {
    patch(s => ({ ...s, title }))
  }, [patch])

  // ── Phases ─────────────────────────────────────────────────────────────────
  const addPhase = useCallback(() => {
    patch(s => {
      const id = `phase-${Date.now()}`
      const newPhase: ScenarioPhase = {
        id,
        label: 'New phase',
        nodeIds: [],
        exhibitIds: [],
      }
      return { ...s, phases: [...(s.phases ?? []), newPhase] }
    })
  }, [patch])

  const updatePhase = useCallback((phaseId: string, updates: Partial<ScenarioPhase>) => {
    patch(s => ({
      ...s,
      phases: (s.phases ?? []).map(p => p.id === phaseId ? { ...p, ...updates } : p),
    }))
  }, [patch])

  const reorderPhases = useCallback((from: number, to: number) => {
    patch(s => {
      const phases = [...(s.phases ?? [])]
      const [moved] = phases.splice(from, 1)
      phases.splice(to, 0, moved)
      return { ...s, phases }
    })
  }, [patch])

  // ── Exhibits ───────────────────────────────────────────────────────────────
  const addExhibit = useCallback((phaseId: string, exhibit: Exhibit) => {
    patch(s => {
      const exhibits = [...(s.exhibits ?? []), exhibit]
      const phases = (s.phases ?? []).map(p =>
        p.id === phaseId
          ? { ...p, exhibitIds: [...(p.exhibitIds ?? []), exhibit.id] }
          : p
      )
      return { ...s, exhibits, phases }
    })
  }, [patch])

  const updateExhibit = useCallback((exhibit: Exhibit) => {
    patch(s => ({
      ...s,
      exhibits: (s.exhibits ?? []).map(e => e.id === exhibit.id ? exhibit : e),
    }))
  }, [patch])

  const removeExhibit = useCallback((exhibitId: string) => {
    patch(s => ({
      ...s,
      exhibits: (s.exhibits ?? []).filter(e => e.id !== exhibitId),
      phases: (s.phases ?? []).map(p => ({
        ...p,
        exhibitIds: (p.exhibitIds ?? []).filter(id => id !== exhibitId),
      })),
    }))
  }, [patch])

  // Toggle "show again later" — add/remove exhibit from all phases after fromPhaseId.
  const toggleExhibitShared = useCallback((exhibitId: string, fromPhaseId: string) => {
    patch(s => {
      const phases = s.phases ?? []
      const fromIdx = phases.findIndex(p => p.id === fromPhaseId)
      if (fromIdx < 0) return s
      const isShared = phases.slice(fromIdx + 1).some(p => (p.exhibitIds ?? []).includes(exhibitId))
      const updatedPhases = phases.map((p, i) => {
        if (i <= fromIdx) return p
        const ids = p.exhibitIds ?? []
        if (isShared) {
          return { ...p, exhibitIds: ids.filter(id => id !== exhibitId) }
        } else {
          return ids.includes(exhibitId) ? p : { ...p, exhibitIds: [...ids, exhibitId] }
        }
      })
      return { ...s, phases: updatedPhases }
    })
  }, [patch])

  // ── Nodes ──────────────────────────────────────────────────────────────────
  const addNode = useCallback((phaseId: string, node: ScenarioNode) => {
    patch(s => {
      const nodes = [...s.nodes, node]
      const phases = (s.phases ?? []).map(p =>
        p.id === phaseId
          ? { ...p, nodeIds: [...p.nodeIds, node.nodeId] }
          : p
      )
      return { ...s, nodes, phases }
    })
  }, [patch])

  const updateNode = useCallback((node: ScenarioNode) => {
    patch(s => ({
      ...s,
      nodes: s.nodes.map(n => n.nodeId === node.nodeId ? node : n),
    }))
  }, [patch])

  const removeNode = useCallback((nodeId: string) => {
    patch(s => ({
      ...s,
      nodes: s.nodes.filter(n => n.nodeId !== nodeId),
      phases: (s.phases ?? []).map(p => ({
        ...p,
        nodeIds: p.nodeIds.filter(id => id !== nodeId),
      })),
    }))
  }, [patch])

  // ── Manual save ────────────────────────────────────────────────────────────
  const saveNow = useCallback(() => {
    const s = scenarioRef.current
    if (!s) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaveStatus('saving')
    updateScenario(s)
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('unsaved'))
  }, [])

  return {
    scenario,
    saveStatus,
    // mutations
    setTitle,
    addPhase,
    updatePhase,
    reorderPhases,
    addExhibit,
    updateExhibit,
    removeExhibit,
    addNode,
    updateNode,
    removeNode,
    toggleExhibitShared,
    saveNow,
  }
}
