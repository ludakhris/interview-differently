import * as yaml from 'js-yaml'
import type { AssessmentQuestion, AssessmentSection, McOption, ParsedAssessment } from './assessment.types'
import { drawSpecFromYaml, parseDrawSpec } from './draw'

/**
 * Parses the assessment markdown format — see docs/assessment-format.md.
 *
 * Tolerant by design: the format is formalised from a hand-written question
 * bank, so trailing explanations after an MC answer letter, options on one
 * line or several, and `---` rules between sections are all accepted.
 * Anything it can't place becomes a warning rather than a hard failure;
 * hard failures are reserved for structural problems (no frontmatter, a
 * section with no questions, an MC question with no answer).
 */

const SECTION_RE = /^##\s+Section\s+(\d+)\s*[:—–-]\s*(.+?)\s*$/
const QUESTION_RE = /^\*\*(\d+\.\d+)\s*\(([^)]+)\)\*\*\s*(.*)$/
const DRAW_RE = /^>\s*draw:\s*(.+?)\s*$/i
const FLAG_RE = /^>\s*(ordered|strictColumns)\s*$/i
const MC_ANSWER_RE = /^\*\*Answer:\s*([A-Z])\b/
const SQL_ANSWER_RE = /^\*\*Answer:\*\*\s*$/
const SQL_STARTER_RE = /^\*\*Starter:\*\*\s*$/
const OPTION_SPLIT_RE = /(?:^|\s{2,}|\t)([A-Z])\)\s*/

type Kind = 'mc' | 'sql' | 'skip'

function kindOf(raw: string): Kind {
  const k = raw.trim().toLowerCase()
  if (k === 'mc' || k === 'multiple choice') return 'mc'
  if (k.includes('sql')) return 'sql'
  return 'skip'
}

export class AssessmentParseError extends Error {}

export function parseAssessmentMarkdown(markdown: string): ParsedAssessment {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const warnings: string[] = []

  // ── Frontmatter ──
  if (lines[0]?.trim() !== '---') throw new AssessmentParseError('Missing frontmatter block (--- at line 1)')
  const fmEnd = lines.indexOf('---', 1)
  if (fmEnd === -1) throw new AssessmentParseError('Unterminated frontmatter block')
  const fm = (yaml.load(lines.slice(1, fmEnd).join('\n')) ?? {}) as Record<string, unknown>
  const slug = String(fm.slug ?? '').trim()
  const title = String(fm.title ?? '').trim()
  const dataset = String(fm.dataset ?? '').trim()
  if (!slug || !title || !dataset) throw new AssessmentParseError('Frontmatter needs slug, title and dataset')
  const defaultDraw = fm.draw == null ? null : drawSpecFromYaml(fm.draw)
  if (fm.draw != null && defaultDraw === null) {
    throw new AssessmentParseError('Frontmatter draw must be a positive integer or a per-type map like { mc: 3, sql: 1 }')
  }

  // ── Body ──
  const sections: AssessmentSection[] = []
  let section: AssessmentSection | null = null
  // In-progress question state
  let q: {
    id: string
    kind: Kind
    promptLines: string[]
    optionText: string[]
    answer: string | null
    flags: Set<string>
    sql: string[] | null // non-null once **Answer:** is seen; the ```sql fence fills it
    sqlDone: boolean
    starter: string[] | null // non-null once **Starter:** is seen; its fence fills it
    starterDone: boolean
    fenceTarget: 'starter' | 'answer' | null // which array the open fence writes to
  } | null = null
  let inFence = false

  const finishQuestion = () => {
    if (!q || !section) return
    const prompt = q.promptLines.join('\n').trim()
    if (q.kind === 'skip') {
      warnings.push(`Question ${q.id} skipped — only MC and Hands-On SQL are supported in v1`)
    } else if (q.kind === 'mc') {
      const options = parseOptions(q.optionText.join('  '))
      if (options.length < 2) throw new AssessmentParseError(`Question ${q.id}: expected at least two A) B) options`)
      if (!q.answer) throw new AssessmentParseError(`Question ${q.id}: missing **Answer: X**`)
      if (!options.find((o) => o.key === q!.answer)) {
        throw new AssessmentParseError(`Question ${q.id}: answer ${q.answer} is not one of the options`)
      }
      section.questions.push({ id: q.id, type: 'mc', prompt, options, answer: q.answer })
    } else {
      const referenceSql = (q.sql ?? []).join('\n').trim()
      if (!referenceSql) throw new AssessmentParseError(`Question ${q.id}: missing \`\`\`sql reference query under **Answer:**`)
      const starterSql = (q.starter ?? []).join('\n').trim()
      section.questions.push({
        id: q.id,
        type: 'sql',
        prompt,
        referenceSql,
        ...(starterSql ? { starterSql } : {}),
        ordered: q.flags.has('ordered'),
        strictColumns: q.flags.has('strictcolumns'),
      })
    }
    q = null
  }

  const finishSection = () => {
    finishQuestion()
    if (section && section.questions.length === 0) {
      warnings.push(`Section ${section.number} "${section.title}" has no usable questions`)
    }
    section = null
  }

  for (let i = fmEnd + 1; i < lines.length; i++) {
    const line = lines[i]

    // Inside a ```sql fence: collect until the closing fence.
    if (inFence) {
      if (line.trim().startsWith('```')) {
        inFence = false
        if (q?.fenceTarget === 'starter') q.starterDone = true
        else if (q) q.sqlDone = true
        if (q) q.fenceTarget = null
      } else if (q?.fenceTarget === 'starter' && q.starter) {
        q.starter.push(line)
      } else if (q?.sql) {
        q.sql.push(line)
      }
      continue
    }

    const sec = SECTION_RE.exec(line)
    if (sec) {
      finishSection()
      section = { id: `s${sec[1]}`, number: Number(sec[1]), title: sec[2], draw: defaultDraw, questions: [] }
      sections.push(section)
      continue
    }

    if (!section) continue // preamble before the first section (e.g. delivery notes)

    const draw = DRAW_RE.exec(line)
    if (draw && !q) {
      const spec = parseDrawSpec(draw[1])
      if (spec === null) warnings.push(`Section ${section.number}: cannot read "> draw: ${draw[1]}" — ignored`)
      else section.draw = spec
      continue
    }

    const qm = QUESTION_RE.exec(line)
    if (qm) {
      finishQuestion()
      const kind = kindOf(qm[2])
      const id = qm[1]
      if (sections.some((s) => s.questions.some((x) => x.id === id))) {
        throw new AssessmentParseError(`Duplicate question id ${id}`)
      }
      q = { id, kind, promptLines: qm[3] ? [qm[3]] : [], optionText: [], answer: null, flags: new Set(), sql: null, sqlDone: false, starter: null, starterDone: false, fenceTarget: null }
      continue
    }

    if (!q) continue

    const flag = FLAG_RE.exec(line)
    if (flag) {
      q.flags.add(flag[1].toLowerCase())
      continue
    }

    if (q.kind === 'mc') {
      const ans = MC_ANSWER_RE.exec(line)
      if (ans) {
        q.answer = ans[1]
        continue
      }
      if (OPTION_SPLIT_RE.test(line) && /^\s*[A-Z]\)/.test(line.trim())) {
        q.optionText.push(line.trim())
        continue
      }
      if (q.optionText.length === 0 && line.trim()) q.promptLines.push(line.trim())
      continue
    }

    if (q.kind === 'sql') {
      if (SQL_STARTER_RE.test(line)) {
        q.starter = []
        continue
      }
      if (SQL_ANSWER_RE.test(line)) {
        q.sql = []
        continue
      }
      if (line.trim().startsWith('```')) {
        if (q.sql && !q.sqlDone) { inFence = true; q.fenceTarget = 'answer'; continue }
        if (q.starter && !q.starterDone) { inFence = true; q.fenceTarget = 'starter'; continue }
      }
      if (q.sql === null && q.starter === null && line.trim()) q.promptLines.push(line.trim())
      continue
    }

    // kind === 'skip': swallow until the next question
  }
  finishSection()

  if (sections.length === 0) throw new AssessmentParseError('No "## Section N: Title" headings found')
  for (const s of sections) {
    if (s.draw === null || s.questions.length === 0) continue
    if (typeof s.draw === 'number') {
      if (s.draw > s.questions.length) {
        warnings.push(`Section ${s.number} draws ${s.draw} but only has ${s.questions.length} questions — all will be used`)
        s.draw = s.questions.length
      }
      continue
    }
    // Per-type: clamp each type to what the section has. No substitution
    // from other types — a short section yields fewer questions, not a
    // different mix.
    for (const [type, want] of Object.entries(s.draw)) {
      const have = s.questions.filter((q) => q.type === type).length
      if (want > have) {
        warnings.push(`Section ${s.number} draws ${want} ${type} but only has ${have} — all will be used`)
        s.draw[type] = have
      }
    }
  }

  return { slug, title, dataset, defaultDraw, sections, warnings }
}

/** "A) foo  B) bar" (one line or several) → [{A, foo}, {B, bar}] */
function parseOptions(text: string): McOption[] {
  const parts = text.split(OPTION_SPLIT_RE)
  // split yields ['', 'A', 'foo', 'B', 'bar', ...]
  const out: McOption[] = []
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const body = parts[i + 1].trim()
    if (body) out.push({ key: parts[i], text: body })
  }
  return out
}

/** Every question in the bank, flattened, keyed by id. */
export function questionIndex(sections: AssessmentSection[]): Map<string, AssessmentQuestion & { sectionId: string }> {
  const m = new Map<string, AssessmentQuestion & { sectionId: string }>()
  for (const s of sections) for (const qq of s.questions) m.set(qq.id, { ...qq, sectionId: s.id })
  return m
}
