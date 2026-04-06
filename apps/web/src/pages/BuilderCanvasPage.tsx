import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import ReactFlow, {
  Background,
  Controls,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { MobileWarning } from '@/components/builder/MobileWarning'
import { BuilderToolbar, type SaveStatus } from '@/components/builder/BuilderToolbar'
import { NodePalette } from '@/components/builder/NodePalette'
import { NodeEditorPanel } from '@/components/builder/NodeEditorPanel'
import { RubricEditor } from '@/components/builder/RubricEditor'
import { BriefingEditor } from '@/components/builder/BriefingEditor'
import { ValidationModal } from '@/components/builder/ValidationModal'
import { StartNode } from '@/components/builder/nodes/StartNode'
import { DecisionNode } from '@/components/builder/nodes/DecisionNode'
import { TransitionNode } from '@/components/builder/nodes/TransitionNode'
import { FeedbackNode } from '@/components/builder/nodes/FeedbackNode'
import { useBuilderCanvas } from '@/hooks/useBuilderCanvas'
import { validateScenario } from '@/hooks/useScenarioValidation'
import { getScenario, updateScenario, publishScenario } from '@/services/builderService'
import type { Scenario, ScenarioNode, RubricDimension } from '@id/types'

const nodeTypes = {
  startNode: StartNode,
  decisionNode: DecisionNode,
  transitionNode: TransitionNode,
  feedbackNode: FeedbackNode,
}

export function BuilderCanvasPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === 'true'

  // Load synchronously from localStorage so canvas initializes with real data
  const [scenario, setScenario] = useState<Scenario | null>(() =>
    scenarioId ? getScenario(scenarioId) : null
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [briefingOpen, setBriefingOpen] = useState(false)
  const [rubricOpen, setRubricOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ReturnType<typeof validateScenario> | null>(null)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSave = useCallback(
    (updated: Scenario) => {
      setSaveStatus('saving')
      updateScenario(updated)
      setScenario(updated)
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus('saved'), 600)
    },
    []
  )

  // Pass real scenario on first render — no empty-scenario corruption
  const canvas = useBuilderCanvas(scenario, handleSave)
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, onDragOver, removeNode } = canvas

  // Mark unsaved when canvas structure changes (but not on the first mount)
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    if (scenario) setSaveStatus('unsaved')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

  // Preview mode
  useEffect(() => {
    if (isPreview && scenario) {
      sessionStorage.setItem(`builder-preview-${scenarioId}`, JSON.stringify(scenario))
      navigate(`/scenario/${scenarioId}/play?builderPreview=true`)
    }
  }, [isPreview, scenario, scenarioId, navigate])

  // Auto-save latest scenario state on unmount
  const saveStatusRef = useRef(saveStatus)
  saveStatusRef.current = saveStatus
  const scenarioRef = useRef(scenario)
  scenarioRef.current = scenario
  useEffect(() => {
    return () => {
      if (saveStatusRef.current === 'unsaved' && scenarioRef.current) {
        updateScenario(scenarioRef.current)
      }
    }
  }, [])

  // ── Not found (sync load — if null here it truly doesn't exist) ───────────
  if (!scenario || !scenarioId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#f5f3ee] text-[16px] mb-4">Scenario not found.</p>
          <button
            onClick={() => navigate('/builder')}
            className="text-[#2d9e5f] text-[13px] underline"
          >
            Back to Scenarios
          </button>
        </div>
      </div>
    )
  }

  // ── Canvas helpers (scenario is guaranteed non-null below) ─────────────────

  const currentScenario: Scenario = scenario

  const selectedNode = selectedNodeId
    ? currentScenario.nodes.find(n => n.nodeId === selectedNodeId) ?? null
    : null

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    const nodeType = event.dataTransfer.getData('application/reactflow')
    if (!nodeType || !rfInstance) return

    const position = rfInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    const newNode = canvas.addNode(nodeType, position)
    const updatedScenario: Scenario = {
      ...currentScenario,
      nodes: [...currentScenario.nodes, newNode],
    }
    setScenario(updatedScenario)
    setSaveStatus('unsaved')
  }

  function handleNodeDelete(nodeId: string) {
    removeNode(nodeId)
    const updatedScenario: Scenario = {
      ...currentScenario,
      nodes: currentScenario.nodes.filter(n => n.nodeId !== nodeId),
    }
    setScenario(updatedScenario)
    setSelectedNodeId(null)
    setSaveStatus('unsaved')
  }

  function handleNodeUpdate(updatedNode: ScenarioNode) {
    canvas.updateNode(updatedNode)
    const updatedScenario: Scenario = {
      ...currentScenario,
      nodes: currentScenario.nodes.map(n =>
        n.nodeId === updatedNode.nodeId ? updatedNode : n
      ),
    }
    setScenario(updatedScenario)
    setSaveStatus('unsaved')
  }

  function handleBriefingUpdate(updates: Pick<Scenario, 'briefing' | 'estimatedMinutes'>) {
    const updatedScenario: Scenario = { ...currentScenario, ...updates }
    setScenario(updatedScenario)
    handleSave(updatedScenario)
  }

  function handleRubricUpdate(dimensions: RubricDimension[]) {
    const updatedScenario: Scenario = { ...currentScenario, rubric: { dimensions } }
    setScenario(updatedScenario)
    handleSave(updatedScenario)
  }

  function handleTitleChange(title: string) {
    const updatedScenario: Scenario = { ...currentScenario, title }
    setScenario(updatedScenario)
    handleSave(updatedScenario)
  }

  function handleManualSave() {
    const updated = canvas.toScenario()
    if (!updated) return
    handleSave({ ...updated, nodes: currentScenario.nodes })
  }

  function handlePreview() {
    sessionStorage.setItem(`builder-preview-${scenarioId}`, JSON.stringify(currentScenario))
    navigate(`/scenario/${scenarioId}/play`)
  }

  function handlePublish() {
    const errors = validateScenario(currentScenario)
    setValidationErrors(errors)
  }

  function handlePublishConfirm() {
    publishScenario(currentScenario.scenarioId)
    const updated: Scenario = {
      ...currentScenario,
      builderMeta: { ...currentScenario.builderMeta!, status: 'published' },
    }
    setScenario(updated)
    setValidationErrors(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a]">
      <MobileWarning />
      <BuilderToolbar
        title={currentScenario.title}
        saveStatus={saveStatus}
        onSave={handleManualSave}
        onTitleChange={handleTitleChange}
        onRubricOpen={() => setRubricOpen(true)}
        onPreview={handlePreview}
        onPublish={handlePublish}
      />

      <div className="flex flex-1 overflow-hidden">
        <NodePalette scenario={currentScenario} />

        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={handleDrop}
            onDragOver={onDragOver}
            onInit={setRfInstance}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
              if (node.type === 'startNode') {
                setBriefingOpen(true)
              } else {
                setSelectedNodeId(node.id)
              }
            }}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            fitViewOptions={{ padding: 0.4 }}
            style={{ background: '#0a0a0a' }}
            deleteKeyCode={['Delete', 'Backspace']}
          >
            <Background color="rgba(255,255,255,0.04)" gap={24} size={1} />
            <Controls
              style={{
                background: '#111111',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
              }}
            />
          </ReactFlow>
        </div>

        <NodeEditorPanel
          selectedNode={selectedNode}
          rubricDimensions={currentScenario.rubric.dimensions}
          allNodes={currentScenario.nodes}
          onUpdate={handleNodeUpdate}
          onDelete={handleNodeDelete}
        />
      </div>

      {briefingOpen && (
        <BriefingEditor
          scenario={currentScenario}
          onUpdate={handleBriefingUpdate}
          onClose={() => setBriefingOpen(false)}
        />
      )}

      {rubricOpen && (
        <RubricEditor
          dimensions={currentScenario.rubric.dimensions}
          onUpdate={handleRubricUpdate}
          onClose={() => setRubricOpen(false)}
        />
      )}

      {validationErrors !== null && (
        <ValidationModal
          errors={validationErrors}
          onClose={() => setValidationErrors(null)}
          onPublishConfirm={validationErrors.length === 0 ? handlePublishConfirm : undefined}
        />
      )}
    </div>
  )
}
