import type { StatusFailures, SystemStatus } from '@id/types'
import type { ReactNode } from 'react'
import { useLoad } from './api'
import { SYSTEM_ADMIN } from './AdminPages'
import { useApp } from './app-context'
import { attemptWhen } from './attemptsText'
import { Notice } from './DashboardShell'
import { errorNotice, useRole } from './shared'
import {
  ago,
  blocksLabel,
  blocksSummary,
  gradingLearnersState,
  gradingRunState,
  hourBlocks,
  kindText,
  memoryPct,
  memoryText,
  n,
  overall,
  playerState,
  shortWhen,
  videoLearnersState,
  videoSetupState,
  type RowState,
  type Tone,
} from './systemStatus'
import './system-status.css'

/**
 * Admin toolbox: System status (GitHub issue #92). How each product is doing for learners, product by product: the
 * Skill Simulator's grading and Micro Learning's videos (Spark's lessons), with one banner for the worst problem. The
 * API answers system admins only.
 */
export function SystemStatusPage() {
  const role = useRole()
  const { href } = useApp()

  if (role !== SYSTEM_ADMIN)
    return (
      <Notice title="Your account does not have access">
        The admin tools are only open to platform administrators.
      </Notice>
    )

  return (
    <>
      <a className="dash-back" href={href('/lms/admin')}>
        ← Admin
      </a>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">System status</h1>
          <p className="dash-sub">
            How each product is doing for learners. Failures are kept for 30 days.
          </p>
        </div>
      </div>
      <StatusBody />
    </>
  )
}

function StatusBody() {
  const status = useLoad<SystemStatus>('/learn/admin/status')
  if (status.error) return errorNotice(status.error)
  if (!status.data)
    return <p className="dash-loading">Checking each product. This can take a few seconds…</p>
  const s = status.data
  const o = overall(s)
  return (
    <div className="ss">
      <section className={`ss-hero ss-tone-${o.tone}`} aria-live="polite">
        <h2 className="ss-hero-title">
          <span className="ss-mark" aria-hidden="true">
            {o.tone === 'ok' ? '✓' : '!'}
          </span>
          {o.title}
        </h2>
        <p className="ss-hero-detail">{o.detail}</p>
      </section>
      <SimulatorSection grading={s.simulator.grading} />
      <SparkSection spark={s.spark} />
    </div>
  )
}

function SimulatorSection({ grading }: { grading: SystemStatus['simulator']['grading'] }) {
  const { selfTest, failures } = grading
  const run = gradingRunState(selfTest)
  const pct = memoryPct(selfTest)
  return (
    <section className="ss-product" aria-labelledby="ss-simulator">
      <h2 className="ss-product-title" id="ss-simulator">
        <span className="ss-product-icon" aria-hidden="true">
          🕹️
        </span>
        Skill Simulator
      </h2>
      <ul className="ss-list" aria-label="Skill Simulator">
        <Row name="Simulation scoring" state={run}>
          {selfTest.status === 'failing' && selfTest.reason && (
            <p className="ss-sub ss-reason">{selfTest.reason}</p>
          )}
          <p className="ss-sub">
            Self-test checked {ago(selfTest.checkedAt)}. Memory: {memoryText(selfTest)}
          </p>
          {pct !== null && <Meter pct={pct} tone={run.tone} />}
        </Row>
        <Row name="Simulation scoring failures" state={gradingLearnersState(grading)}>
          <HourBlocks failures={failures} what="Simulation scoring" />
        </Row>
      </ul>
      <dl className="ss-facts">
        <div>
          <dt>Failures, last {failures.windowHours} hours</dt>
          <dd>{n(failures.count)}</dd>
        </div>
        <div>
          <dt>Memory used</dt>
          <dd>{pct === null ? 'Not measured' : `${pct}%`}</dd>
        </div>
        <div>
          <dt>Last failure</dt>
          <dd>
            <LastFailure at={grading.lastFailureAt} />
          </dd>
        </div>
      </dl>
      <RecentFailures history={grading} what="simulation scoring" />
    </section>
  )
}

function SparkSection({ spark }: { spark: SystemStatus['spark'] }) {
  const { setup, player, lessons } = spark
  return (
    <section className="ss-product" aria-labelledby="ss-spark">
      <h2 className="ss-product-title" id="ss-spark">
        <span className="ss-product-icon" aria-hidden="true">
          💡
        </span>
        Micro Learning (Spark)
      </h2>
      <ul className="ss-list" aria-label="Micro Learning (Spark)">
        <Row name="Video lessons" state={videoSetupState(setup)}>
          {setup.status === 'ok' ? (
            <p className="ss-sub">Videos made for learners can be written and linked.</p>
          ) : (
            setup.problems.map((p) => (
              <p className="ss-sub ss-reason" key={p}>
                {p}
              </p>
            ))
          )}
        </Row>
        <Row name="Video lesson player" state={playerState(player)}>
          {player.status === 'not-set-up' ? (
            <p className="ss-sub">There is no player address (SPARK_WEB_URL) to check.</p>
          ) : (
            <>
              {player.reason && <p className="ss-sub ss-reason">{player.reason}</p>}
              <p className="ss-sub">
                {player.status === 'ok' ? 'The player answered' : 'Checked'} {ago(player.checkedAt)}
                . It is checked at most once every five minutes.
              </p>
            </>
          )}
        </Row>
        <Row name="Video lesson failures" state={videoLearnersState(spark)}>
          <HourBlocks failures={lessons.failures} what="Video lesson" />
        </Row>
      </ul>
      <dl className="ss-facts">
        <div>
          <dt>Failures, last {lessons.failures.windowHours} hours</dt>
          <dd>{n(lessons.failures.count)}</dd>
        </div>
        <div>
          <dt>Last failure</dt>
          <dd>
            <LastFailure at={lessons.lastFailureAt} />
          </dd>
        </div>
      </dl>
      <RecentFailures history={lessons} what="video lesson" />
    </section>
  )
}

function Row({ name, state, children }: { name: string; state: RowState; children: ReactNode }) {
  return (
    <li className="ss-item">
      <div className="ss-row">
        <h3 className="ss-name">{name}</h3>
        <span className={`ss-pill ss-pill-${state.tone}`}>{state.word}</span>
      </div>
      {children}
    </li>
  )
}

function Meter({ pct, tone }: { pct: number; tone: Tone }) {
  return (
    <div
      className="ss-meter"
      role="meter"
      aria-label="Grading memory used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <span className={`ss-meter-fill ss-bg-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** One block per hour of the window, red where learners hit failures. */
function HourBlocks({
  failures,
  what,
}: {
  failures: StatusFailures<string>['failures']
  what: string
}) {
  return (
    <>
      <div className="ss-segs" role="img" aria-label={blocksLabel(failures, what)}>
        {hourBlocks(failures).map((r, i) => (
          <span
            key={i}
            className={`ss-seg ${r.count > 0 ? 'ss-seg-bad' : 'ss-seg-ok'}`}
            title={r.label}
          />
        ))}
      </div>
      <p className="ss-axis" aria-hidden="true">
        <span>{failures.windowHours} hours ago</span>
        <span>{blocksSummary(failures)}</span>
        <span>Now</span>
      </p>
    </>
  )
}

function LastFailure({ at }: { at: string | null }) {
  return at ? (
    <time dateTime={at} title={attemptWhen(at)}>
      {ago(at)}
    </time>
  ) : (
    <>None in 30 days</>
  )
}

function RecentFailures({ history, what }: { history: StatusFailures<string>; what: string }) {
  const { failures } = history
  const id = `ss-recent-${what}`
  return (
    <section className="ss-section" aria-labelledby={id}>
      <h3 className="ss-section-title" id={id}>
        Recent {what} failures
      </h3>
      {failures.latest.length === 0 ? (
        <p className="ss-empty">No failures in the last {failures.windowHours} hours.</p>
      ) : (
        <>
          <div className="ss-table-wrap">
            <table className="ss-table" aria-label={`Latest ${what} failures`}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">What happened</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {failures.latest.map((f, i) => (
                  <tr key={`${f.at}-${i}`}>
                    <td className="ss-nowrap">
                      <time dateTime={f.at} title={attemptWhen(f.at)}>
                        {shortWhen(f.at)}
                      </time>
                    </td>
                    <td className="ss-nowrap">{kindText(f.kind)}</td>
                    <td>{f.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {failures.count > failures.latest.length && (
            <p className="ss-note">
              Showing the newest {failures.latest.length} of {n(failures.count)}.
            </p>
          )}
        </>
      )}
    </section>
  )
}
