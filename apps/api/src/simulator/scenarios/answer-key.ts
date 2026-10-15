/**
 * The copy of a scenario sent to a launched learner's browser, with its answer key withheld.
 * Scoring happens on the server (`LtiPlayService`), so the player never needs the key: which
 * choice is strongest, each quant field's accepted band and model answer, the SQL reference query
 * and the hint texts. Each is revealed by the server only after the learner answers (or, for a
 * hint, asks for it).
 *
 * Fields the player's types require keep a placeholder (`0`, `''`, `[]`) so nothing downstream
 * crashes on a missing key; the player takes the real values from the server's replies.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

const withholdField = (f: Json): Json => {
  if (!f || typeof f !== 'object') return f
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { derivation, ...rest } = f
  return { ...rest, acceptedRange: { min: 0, max: 0 }, modelAnswer: 0 }
}

function withholdQuant(quant: Json): Json {
  if (!quant || typeof quant !== 'object') return quant
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hint, hintFootnote, ...rest } = quant
  return {
    ...rest,
    ...(rest.field ? { field: withholdField(rest.field) } : {}),
    ...(Array.isArray(rest.fields) ? { fields: rest.fields.map(withholdField) } : {}),
    ...(hint ? { hasHint: true } : {}),
  }
}

function withholdSql(sql: Json): Json {
  if (!sql || typeof sql !== 'object') return sql
  const { hint, ...rest } = sql
  return { ...rest, referenceSql: '', ...(hint ? { hasHint: true } : {}) }
}

function withholdNode(node: Json): Json {
  if (!node || typeof node !== 'object') return node
  return {
    ...node,
    ...(Array.isArray(node.choices)
      ? { choices: node.choices.map((c: Json) => ({ ...c, qualitySignals: [] })) }
      : {}),
    ...(node.quant ? { quant: withholdQuant(node.quant) } : {}),
    ...(node.sql ? { sql: withholdSql(node.sql) } : {}),
  }
}

export function withholdAnswerKey<T extends object>(scenario: T): T {
  const { nodes } = scenario as { nodes?: unknown }
  if (!Array.isArray(nodes)) return scenario
  return { ...scenario, nodes: nodes.map(withholdNode) }
}
