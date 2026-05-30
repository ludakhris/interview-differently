// Safe formula evaluator for QuantFormula expressions.
//
// Supports: + - * / parentheses, integer + decimal literals, variable
// references like {families}. No `eval`, no Function constructor — a small
// shunting-yard parser keeps the surface area honest.
//
// Returns `null` when the formula references a variable with no provided
// value, or when the expression fails to parse. Callers should treat null
// as "incomplete" and skip showing a computed total.

export interface EvalOptions {
  variables: Record<string, number | undefined>
}

export function evaluateFormula(
  expression: string,
  options: EvalOptions,
): number | null {
  try {
    const tokens = tokenize(expression, options.variables)
    if (tokens === null) return null
    const rpn = toRPN(tokens)
    if (rpn === null) return null
    return evalRPN(rpn)
  } catch {
    return null
  }
}

// ── Tokenizer ────────────────────────────────────────────────────────────────

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

function tokenize(
  expr: string,
  vars: Record<string, number | undefined>,
): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (c === ' ' || c === '\t') {
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen' })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen' })
      i++
      continue
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      tokens.push({ kind: 'op', value: c })
      i++
      continue
    }
    if (c === '{') {
      const end = expr.indexOf('}', i)
      if (end < 0) return null
      const name = expr.slice(i + 1, end)
      const v = vars[name]
      if (typeof v !== 'number' || !Number.isFinite(v)) return null
      tokens.push({ kind: 'num', value: v })
      i = end + 1
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++
      const n = Number(expr.slice(i, j))
      if (!Number.isFinite(n)) return null
      tokens.push({ kind: 'num', value: n })
      i = j
      continue
    }
    return null
  }
  return tokens
}

// ── Shunting-yard → RPN ──────────────────────────────────────────────────────

const PRECEDENCE: Record<'+' | '-' | '*' | '/', number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
}

function toRPN(tokens: Token[]): Token[] | null {
  const output: Token[] = []
  const ops: Token[] = []
  for (const t of tokens) {
    if (t.kind === 'num') {
      output.push(t)
    } else if (t.kind === 'op') {
      while (
        ops.length &&
        ops[ops.length - 1].kind === 'op' &&
        PRECEDENCE[(ops[ops.length - 1] as { kind: 'op'; value: '+' | '-' | '*' | '/' }).value] >= PRECEDENCE[t.value]
      ) {
        output.push(ops.pop() as Token)
      }
      ops.push(t)
    } else if (t.kind === 'lparen') {
      ops.push(t)
    } else if (t.kind === 'rparen') {
      while (ops.length && ops[ops.length - 1].kind !== 'lparen') {
        output.push(ops.pop() as Token)
      }
      if (!ops.length) return null
      ops.pop() // discard lparen
    }
  }
  while (ops.length) {
    const top = ops.pop()!
    if (top.kind === 'lparen' || top.kind === 'rparen') return null
    output.push(top)
  }
  return output
}

function evalRPN(tokens: Token[]): number | null {
  const stack: number[] = []
  for (const t of tokens) {
    if (t.kind === 'num') {
      stack.push(t.value)
      continue
    }
    if (t.kind === 'op') {
      const b = stack.pop()
      const a = stack.pop()
      if (a === undefined || b === undefined) return null
      let r: number
      if (t.value === '+') r = a + b
      else if (t.value === '-') r = a - b
      else if (t.value === '*') r = a * b
      else if (t.value === '/') r = b === 0 ? NaN : a / b
      else return null
      stack.push(r)
    }
  }
  if (stack.length !== 1) return null
  const result = stack[0]
  return Number.isFinite(result) ? result : null
}

// ── Band classification ──────────────────────────────────────────────────────

import type { QuantBand, QuantBandHit } from '@id/types'

export function classifyAnswer(value: number, band: QuantBand): QuantBandHit {
  if (band.idealMin !== undefined && band.idealMax !== undefined) {
    if (value >= band.idealMin && value <= band.idealMax) return 'ideal'
  }
  if (value >= band.min && value <= band.max) return 'accepted'
  return value < band.min ? 'low' : 'high'
}

// ── Number formatting ────────────────────────────────────────────────────────

import type { QuantNumberFormat } from '@id/types'

export function formatQuantValue(
  value: number,
  format: QuantNumberFormat | undefined,
  unit: string | undefined,
): string {
  let core: string
  if (format === 'currency') core = `$${value.toLocaleString()}`
  else if (format === 'percent') core = `${value}%`
  else if (format === 'integer') core = Math.round(value).toLocaleString()
  else if (format === 'decimal') core = value.toLocaleString()
  else core = value.toLocaleString()
  return unit ? `${core} ${unit}` : core
}
