import { useState, useCallback, useEffect, useRef } from 'react'
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from 'reactflow'
import type { Scenario, ScenarioNode } from '@id/types'

export type RFNode = Node<ScenarioNode>
export type RFEdge = Edge

function scenarioToRFNodes(scenario: Scenario): RFNode[] {
  if (!scenario?.nodes) return []
  const positions = scenario.builderMeta?.positions ?? {}
  const nodes: RFNode[] = []

  // Create a special start node for entry
  const firstNode = scenario.nodes[0]
  if (firstNode) {
    nodes.push({
      id: `start-${firstNode.nodeId}`,
      type: 'startNode',
      position: positions[`start-${firstNode.nodeId}`] ?? { x: 300, y: 20 },
      data: firstNode,
    })
  }

  scenario.nodes.forEach(n => {
    const typeMap: Record<string, string> = {
      decision: 'decisionNode',
      transition: 'transitionNode',
      feedback: 'feedbackNode',
    }
    nodes.push({
      id: n.nodeId,
      type: typeMap[n.type] ?? 'decisionNode',
      position: positions[n.nodeId] ?? { x: 300, y: 200 },
      data: n,
    })
  })

  return nodes
}

function scenarioToRFEdges(scenario: Scenario): RFEdge[] {
  if (!scenario?.nodes) return []
  const edges: RFEdge[] = []
  const firstNode = scenario.nodes[0]

  // Edge from start node to first decision node
  if (firstNode) {
    edges.push({
      id: `start-edge-${firstNode.nodeId}`,
      source: `start-${firstNode.nodeId}`,
      target: firstNode.nodeId,
      style: { stroke: '#2d9e5f', strokeWidth: 2 },
    })
  }

  scenario.nodes.forEach(node => {
    if (node.type === 'decision' && node.choices) {
      node.choices.forEach(choice => {
        if (choice.nextNodeId) {
          edges.push({
            id: `${node.nodeId}-${choice.id}-${choice.nextNodeId}`,
            source: node.nodeId,
            sourceHandle: choice.id,
            target: choice.nextNodeId,
            label: choice.id,
            labelStyle: { fill: '#f5f3ee', fontSize: 10, fontWeight: 700 },
            labelBgStyle: { fill: '#1a5a8a' },
            style: { stroke: '#1a5a8a', strokeWidth: 1.5 },
          })
        }
      })
    }
    if (node.type === 'transition' && node.nextNodeId) {
      edges.push({
        id: `${node.nodeId}-transition-${node.nextNodeId}`,
        source: node.nodeId,
        target: node.nextNodeId,
        style: { stroke: '#d4830a', strokeWidth: 1.5 },
      })
    }
  })

  return edges
}

function rfNodesToScenario(
  rfNodes: RFNode[],
  rfEdges: RFEdge[],
  original: Scenario
): Scenario {
  // Extract positions
  const positions: Record<string, { x: number; y: number }> = {}
  rfNodes.forEach(n => {
    positions[n.id] = { x: n.position.x, y: n.position.y }
  })

  // Rebuild scenario nodes (skip start placeholder)
  const contentNodes = rfNodes.filter(n => n.type !== 'startNode')

  // Build a map of decision edges: nodeId -> { choiceId -> targetId }
  const decisionEdgeMap: Record<string, Record<string, string>> = {}
  const transitionEdgeMap: Record<string, string> = {}

  rfEdges.forEach(edge => {
    if (edge.sourceHandle) {
      // Decision edge
      if (!decisionEdgeMap[edge.source]) decisionEdgeMap[edge.source] = {}
      decisionEdgeMap[edge.source][edge.sourceHandle] = edge.target
    } else if (!edge.id.startsWith('start-edge-')) {
      // Transition edge
      transitionEdgeMap[edge.source] = edge.target
    }
  })

  const updatedNodes: ScenarioNode[] = contentNodes.map(rfNode => {
    const original_node = rfNode.data
    if (original_node.type === 'decision') {
      const choiceMap = decisionEdgeMap[rfNode.id] ?? {}
      const existingChoices = original_node.choices ?? []
      const choices = (['A', 'B', 'C', 'D'] as const).map(id => {
        const existing = existingChoices.find(c => c.id === id)
        return {
          id,
          text: existing?.text ?? '',
          nextNodeId: choiceMap[id] ?? existing?.nextNodeId ?? '',
          qualitySignals: existing?.qualitySignals ?? [],
        }
      })
      return { ...original_node, choices }
    }
    if (original_node.type === 'transition') {
      return {
        ...original_node,
        nextNodeId: transitionEdgeMap[rfNode.id] ?? original_node.nextNodeId ?? '',
      }
    }
    return original_node
  })

  return {
    ...original,
    nodes: updatedNodes,
    builderMeta: {
      ...original.builderMeta!,
      positions,
    },
  }
}

export function useBuilderCanvas(scenario: Scenario | null, onSave: (s: Scenario) => void) {
  const [nodes, setNodes] = useState<RFNode[]>(() => scenarioToRFNodes(scenario as Scenario))
  const [edges, setEdges] = useState<RFEdge[]>(() => scenarioToRFEdges(scenario as Scenario))
  const scenarioRef = useRef(scenario)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep ref in sync
  scenarioRef.current = scenario

  const onNodesChange: OnNodesChange = useCallback(changes => {
    setNodes(nds => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange: OnEdgesChange = useCallback(changes => {
    setEdges(eds => applyEdgeChanges(changes, eds))
  }, [])

  const onConnect: OnConnect = useCallback((params: Connection) => {
    setEdges(eds =>
      addEdge(
        {
          ...params,
          style: { stroke: '#1a5a8a', strokeWidth: 1.5 },
        },
        eds
      )
    )
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const toScenario = useCallback((): Scenario | null => {
    if (!scenarioRef.current) return null
    return rfNodesToScenario(nodes, edges, scenarioRef.current)
  }, [nodes, edges])

  // Auto-save every 30 seconds (only when scenario is loaded and nodes are populated)
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      if (!scenarioRef.current || nodes.length === 0) return
      const updated = rfNodesToScenario(nodes, edges, scenarioRef.current!)
      onSave(updated)
    }, 30000)
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
    }
  }, [nodes, edges, onSave])

  function addNode(nodeType: string, position: { x: number; y: number }): ScenarioNode {
    const nodeId = crypto.randomUUID()
    const typeMap: Record<string, ScenarioNode['type']> = {
      decisionNode: 'decision',
      transitionNode: 'transition',
      feedbackNode: 'feedback',
    }
    const scenarioNodeType: ScenarioNode['type'] = typeMap[nodeType] ?? 'decision'

    const newScenarioNode: ScenarioNode = {
      nodeId,
      type: scenarioNodeType,
      narrative: '',
      ...(scenarioNodeType === 'decision'
        ? {
            choices: [
              { id: 'A', text: '', nextNodeId: '', qualitySignals: [] },
              { id: 'B', text: '', nextNodeId: '', qualitySignals: [] },
              { id: 'C', text: '', nextNodeId: '', qualitySignals: [] },
              { id: 'D', text: '', nextNodeId: '', qualitySignals: [] },
            ],
          }
        : {}),
    }

    const newRFNode: RFNode = {
      id: nodeId,
      type: nodeType,
      position,
      data: newScenarioNode,
    }

    setNodes(nds => [...nds, newRFNode])
    return newScenarioNode
  }

  function updateNode(updatedScenarioNode: ScenarioNode) {
    setNodes(nds =>
      nds.map(n =>
        n.id === updatedScenarioNode.nodeId
          ? { ...n, data: updatedScenarioNode }
          : n
      )
    )
  }

  function removeNode(nodeId: string) {
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
  }

  function syncFromScenario(s: Scenario) {
    setNodes(scenarioToRFNodes(s))
    setEdges(scenarioToRFEdges(s))
  }

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onDragOver,
    addNode,
    updateNode,
    removeNode,
    toScenario,
    syncFromScenario,
  }
}
