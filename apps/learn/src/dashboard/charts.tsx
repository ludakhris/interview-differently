import { useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react'
import { pct, points, score } from './format'

// Charts are built from positioned HTML so they scale with the page and every
// mark is a focusable element. Colours come from the Delaware tokens in
// dashboard.css (validated with the dataviz palette checks): pre = gray,
// post/completion = blue, interview ready = orange, funnel = one-hue ramp.

// ── tooltip ─────────────────────────────────────────────────────────────────

interface Tip {
  x: number
  y: number
  node: ReactNode
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const bind = (node: ReactNode) => ({
    onPointerMove: (e: PointerEvent) => setTip({ x: e.clientX, y: e.clientY, node }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      setTip({ x: r.left + r.width / 2, y: r.top, node })
    },
    onBlur: () => setTip(null),
  })
  const el = tip && (
    <div className="dash-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.node}
    </div>
  )
  return { bind, el }
}

function TipRow({ swatch, label, value }: { swatch?: string; label: string; value: string }) {
  return (
    <div className="dash-tip-row">
      {swatch && <span className={`dash-key ${swatch}`} aria-hidden="true" />}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

// ── shared bits ─────────────────────────────────────────────────────────────

const TICKS = [0, 25, 50, 75, 100]

/** Axis domain for position marks: start at a round number just below the data. */
function domainFor(values: (number | null)[]): { lo: number; ticks: number[] } {
  const nums = values.filter((v): v is number => v !== null)
  const lo = nums.length === 0 ? 0 : Math.max(0, Math.floor((Math.min(...nums) - 5) / 10) * 10)
  if (lo === 0) return { lo, ticks: TICKS }
  const ticks: number[] = []
  for (let t = lo; t <= 100; t += 10) ticks.push(t)
  return { lo, ticks }
}

const at = (v: number, lo: number) => `${((v - lo) / (100 - lo)) * 100}%`

function Axis({
  suffix = '',
  ticks = TICKS,
  lo = 0,
  valueLabel,
}: {
  suffix?: string
  ticks?: number[]
  lo?: number
  valueLabel?: string
}) {
  return (
    <div className="dash-axis" aria-hidden="true">
      <div />
      <div className="dash-plot-wrap">
        {ticks.map((t) => (
          <span key={t} style={{ left: at(t, lo) }}>
            {t}
            {suffix}
          </span>
        ))}
      </div>
      <div className="dash-axis-label">{valueLabel}</div>
    </div>
  )
}

function Grid({ ticks = TICKS, lo = 0 }: { ticks?: number[]; lo?: number }) {
  return (
    <>
      {ticks.map((t) => (
        <span key={t} className="dash-grid" style={{ left: at(t, lo) }} aria-hidden="true" />
      ))}
    </>
  )
}

export function Legend({ items }: { items: { swatch: string; label: string }[] }) {
  return (
    <ul className="dash-legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className={`dash-key ${i.swatch}`} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

function RowLabel({ label, sub, href }: { label: string; sub?: string; href?: string }) {
  return (
    <div className="dash-rowlabel">
      <span className="dash-rowlabel-main">{href ? <a href={href}>{label}</a> : label}</span>
      {sub && <span className="dash-rowlabel-sub">{sub}</span>}
    </div>
  )
}

// ── stat tile ───────────────────────────────────────────────────────────────

export function StatTile(props: { label: string; value: string; note?: string }) {
  return (
    <div className="dash-tile">
      <span className="dash-tile-label">{props.label}</span>
      <span className="dash-tile-value">{props.value}</span>
      {props.note && <span className="dash-tile-note">{props.note}</span>}
    </div>
  )
}

// ── pre → post (dumbbell) ───────────────────────────────────────────────────

export interface DumbbellRow {
  key: string
  label: string
  sub?: string
  /** Opens what the row is about (a provider's or cohort's page), when the viewer may open it. */
  href?: string
  group?: string
  /** Opens the group the row sits under, when the viewer may open it. */
  groupHref?: string
  pre: number | null
  post: number | null
  /** Text for the right-hand column (e.g. share who reached the target). */
  value?: string
}

export function Dumbbell({ rows, valueLabel }: { rows: DumbbellRow[]; valueLabel?: string }) {
  const { bind, el } = useTip()
  const { lo, ticks } = domainFor(rows.flatMap((r) => [r.pre, r.post]))
  let lastGroup: string | undefined
  return (
    <div className="dash-chart" role="list">
      <Axis ticks={ticks} lo={lo} suffix="%" valueLabel={valueLabel} />
      {rows.map((r) => {
        const gain = r.pre !== null && r.post !== null ? r.post - r.pre : null
        const heading = r.group !== undefined && r.group !== lastGroup ? r.group : null
        lastGroup = r.group
        const tip = (
          <>
            <strong className="dash-tip-title">{r.label}</strong>
            <TipRow swatch="dash-pre dash-round" label="Pre-assessment" value={score(r.pre)} />
            <TipRow swatch="dash-post dash-round" label="Post-assessment" value={score(r.post)} />
            <TipRow label="Change in percentage points" value={points(gain)} />
          </>
        )
        return (
          <div key={r.key}>
            {heading && (
              <div className="dash-group">
                {r.groupHref ? <a href={r.groupHref}>{heading}</a> : heading}
              </div>
            )}
            <div
              className="dash-row"
              role="listitem"
              tabIndex={0}
              aria-label={`${r.label}: pre ${score(r.pre)}, post ${score(r.post)}${r.value ? `, ${valueLabel ?? ''} ${r.value}` : ''}`}
              {...bind(tip)}
            >
              <RowLabel label={r.label} sub={r.sub} href={r.href} />
              <div className="dash-plot-wrap">
                <div className="dash-plot">
                  <Grid ticks={ticks} lo={lo} />
                  {r.pre !== null && r.post !== null && (
                    <span
                      className="dash-conn"
                      style={{
                        left: at(Math.min(r.pre, r.post), lo),
                        width: `${(Math.abs(r.post - r.pre) / (100 - lo)) * 100}%`,
                      }}
                    />
                  )}
                  {r.pre !== null && (
                    <span className="dash-dot dash-pre" style={{ left: at(r.pre, lo) }} />
                  )}
                  {r.post !== null && (
                    <span className="dash-dot dash-post" style={{ left: at(r.post, lo) }} />
                  )}
                </div>
              </div>
              <div className="dash-rowvalue">{r.value ?? (gain === null ? '—' : points(gain))}</div>
            </div>
          </div>
        )
      })}
      {el}
    </div>
  )
}

// ── two measures per row (grouped bars) ─────────────────────────────────────

export interface PairRow {
  key: string
  label: string
  sub?: string
  href?: string
  a: number | null // 0-1
  b: number | null // 0-1
}

export function PairedBars(props: {
  rows: PairRow[]
  a: { label: string; swatch: string }
  b: { label: string; swatch: string }
}) {
  const { bind, el } = useTip()
  return (
    <div className="dash-chart" role="list">
      <Axis suffix="%" />
      {props.rows.map((r) => {
        const tip = (
          <>
            <strong className="dash-tip-title">{r.label}</strong>
            <TipRow swatch={props.a.swatch} label={props.a.label} value={pct(r.a)} />
            <TipRow swatch={props.b.swatch} label={props.b.label} value={pct(r.b)} />
          </>
        )
        return (
          <div
            key={r.key}
            className="dash-row dash-row-tall"
            role="listitem"
            tabIndex={0}
            aria-label={`${r.label}: ${props.a.label} ${pct(r.a)}, ${props.b.label} ${pct(r.b)}`}
            {...bind(tip)}
          >
            <RowLabel label={r.label} sub={r.sub} href={r.href} />
            <div className="dash-plot-wrap">
              <div className="dash-plot dash-plot-bars">
                <Grid />
                {[
                  { v: r.a, swatch: props.a.swatch },
                  { v: r.b, swatch: props.b.swatch },
                ].map((s) => (
                  <div key={s.swatch} className="dash-barline">
                    {s.v !== null && (
                      <>
                        <span
                          className={`dash-bar ${s.swatch}`}
                          style={{ width: `${Math.round(s.v * 100)}%` }}
                        />
                        <span className="dash-barval" style={{ left: `${Math.round(s.v * 100)}%` }}>
                          {pct(s.v)}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div />
          </div>
        )
      })}
      {el}
    </div>
  )
}

// ── funnel (ordinal bars) ───────────────────────────────────────────────────

export function Funnel({ stages }: { stages: { key: string; label: string; count: number }[] }) {
  const { bind, el } = useTip()
  const top = stages[0]?.count || 1
  return (
    <div className="dash-chart dash-funnel" role="list">
      {stages.map((s, i) => {
        const prev = i === 0 ? null : stages[i - 1].count
        const drop = prev && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null
        const tip = (
          <>
            <strong className="dash-tip-title">{s.label}</strong>
            <TipRow label="Learners" value={String(s.count)} />
            <TipRow label="Of enrolled" value={pct(s.count / top)} />
            {drop !== null && <TipRow label="Drop from previous stage" value={`${drop}%`} />}
          </>
        )
        return (
          <div
            key={s.key}
            className="dash-row dash-row-funnel"
            role="listitem"
            tabIndex={0}
            aria-label={`${s.label}: ${s.count} learners, ${pct(s.count / top)} of enrolled`}
            {...bind(tip)}
          >
            <RowLabel label={s.label} />
            <div className="dash-plot-wrap">
              <div className="dash-plot dash-plot-funnel">
                <span
                  className={`dash-bar dash-step-${i + 1}`}
                  style={{ width: `${Math.max(1, (s.count / top) * 100)}%` }}
                />
                <span className="dash-barval" style={{ left: `${(s.count / top) * 100}%` }}>
                  {s.count}
                </span>
              </div>
            </div>
            <div className="dash-rowvalue dash-rowvalue-soft">
              {i === 0 ? '100%' : pct(s.count / top)}
            </div>
          </div>
        )
      })}
      {el}
    </div>
  )
}

// ── inline meter for tables ─────────────────────────────────────────────────

export function Meter({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="dash-muted">—</span>
  return (
    <span className="dash-meter" role="img" aria-label={`${label ?? ''} ${pct(value)}`.trim()}>
      <span className="dash-meter-track">
        <span className="dash-meter-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="dash-meter-num">{pct(value)}</span>
    </span>
  )
}
