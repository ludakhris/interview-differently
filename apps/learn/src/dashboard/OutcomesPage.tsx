import type { AgencyOutcomes } from '@id/types'
import { useState } from 'react'
import { downloadFile, useApiFetch, useLoad } from './api'
import { Dumbbell, Funnel, Legend, Meter, PairedBars, StatTile } from './charts'
import { dateShort, pct, points, score } from './format'
import { useApp } from './app-context'
import { errorNotice, useRole } from './shared'

export function OutcomesPage({ tenant }: { tenant: string }) {
  const { data, error, loading } = useLoad<AgencyOutcomes>(
    `/learn/agency/outcomes?tenant=${encodeURIComponent(tenant)}`
  )
  if (error) return errorNotice(error)
  if (loading || !data) return <p className="dash-loading">Loading outcomes…</p>
  return <Outcomes data={data} tenant={tenant} />
}

export function Outcomes({ data, tenant }: { data: AgencyOutcomes; tenant: string }) {
  const { href } = useApp()
  const t = data.totals
  const role = useRole()
  const apiFetch = useApiFetch()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)

  async function exportCsv() {
    setExporting(true)
    setExportError(false)
    try {
      await downloadFile(
        apiFetch,
        `/learn/agency/exit-file.csv?tenant=${encodeURIComponent(tenant)}`,
        `exit-file-${data.asOf.slice(0, 10)}.csv`
      )
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  const providers = data.providers
  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">Training program outcomes</h1>
          <p className="dash-sub">
            {data.agency.name}. Fictional providers and sample participants, as of{' '}
            {dateShort(data.asOf)}.
          </p>
        </div>
      </div>

      <section aria-label="Headline measures" className="dash-tiles">
        <StatTile
          label="Participants enrolled"
          value={String(t.enrolled)}
          note={`${data.cohorts.length} ${data.cohorts.length === 1 ? 'cohort' : 'cohorts'}, ${providers.length} ${providers.length === 1 ? 'provider' : 'providers'}`}
        />
        <StatTile label="Completion rate" value={pct(t.completionRate)} note="Finished cohorts" />
        <StatTile
          label="Reached target score"
          value={pct(t.targetRate)}
          note={`Finished cohorts. Average score ${score(t.avgPre)} → ${score(t.avgPost)}`}
        />
        <StatTile
          label="Interview ready"
          value={String(t.interviewReady)}
          note={`${pct(t.readyRate)} of enrolled`}
        />
      </section>

      <section className="dash-section" aria-labelledby="h-growth">
        <h2 className="dash-h2" id="h-growth">
          Assessment scores before and after training, by provider
        </h2>
        <p className="dash-sub">
          Average assessment score before and after training. The figure on the right is the share
          of learners who reached the course&apos;s target score.
        </p>
        <Legend
          items={[
            { swatch: 'dash-pre dash-round', label: 'Pre-assessment' },
            { swatch: 'dash-post dash-round', label: 'Post-assessment' },
          ]}
        />
        <Dumbbell
          valueLabel="Reached target"
          rows={providers.map((p) => ({
            key: p.providerId,
            label: p.provider,
            sub: p.program,
            pre: p.avgPre,
            post: p.avgPost,
            value: pct(p.targetRate),
          }))}
        />
      </section>

      <section className="dash-section" aria-labelledby="h-complete">
        <h2 className="dash-h2" id="h-complete">
          Completion and interview readiness by provider
        </h2>
        <p className="dash-sub">
          Completion counts finished cohorts only. Interview ready means the learner&apos;s best
          practice interview meets the threshold the course author set.
        </p>
        <Legend
          items={[
            { swatch: 'dash-post', label: 'Completion rate' },
            { swatch: 'dash-ready', label: 'Interview ready' },
          ]}
        />
        <PairedBars
          a={{ label: 'Completion rate', swatch: 'dash-post' }}
          b={{ label: 'Interview ready', swatch: 'dash-ready' }}
          rows={providers.map((p) => ({
            key: p.providerId,
            label: p.provider,
            sub: p.program,
            a: p.completionRate,
            b: p.readyRate,
          }))}
        />
        <details className="dash-table-view">
          <summary>View provider data as a table</summary>
          <div className="dash-tablewrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col" className="num">
                    Enrolled
                  </th>
                  <th scope="col" className="num">
                    Completion
                  </th>
                  <th scope="col" className="num">
                    Pre
                  </th>
                  <th scope="col" className="num">
                    Post
                  </th>
                  <th scope="col" className="num">
                    Change (% points)
                  </th>
                  <th scope="col" className="num">
                    Interview ready
                  </th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.providerId}>
                    <th scope="row">{p.provider}</th>
                    <td className="num">{p.enrolled}</td>
                    <td className="num">{pct(p.completionRate)}</td>
                    <td className="num">{score(p.avgPre)}</td>
                    <td className="num">{score(p.avgPost)}</td>
                    <td className="num">{pct(p.targetRate)}</td>
                    <td className="num">{pct(p.readyRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="dash-section" aria-labelledby="h-funnel">
        <h2 className="dash-h2" id="h-funnel">
          From enrollment to completion
        </h2>
        <p className="dash-sub">
          How far participants in finished cohorts got. Cohorts still running are left out until
          they end.
        </p>
        <Funnel stages={data.funnel} />
      </section>

      <section className="dash-section" aria-labelledby="h-cohorts">
        <h2 className="dash-h2" id="h-cohorts">
          Cohorts
        </h2>
        <p className="dash-sub">
          Assessment scores before and after training for each cohort, grouped by provider. Open a
          cohort for its gradebook.
        </p>
        {role === 'agency-admin' && (
          <p className="dash-sub">
            <button type="button" className="dash-linkbtn" onClick={exportCsv} disabled={exporting}>
              {exporting ? 'Preparing…' : 'Export participant records (CSV)'}
            </button>
            {exportError && <span className="dash-error"> The export failed. Try again.</span>}
          </p>
        )}
        <Legend
          items={[
            { swatch: 'dash-pre dash-round', label: 'Pre-assessment' },
            { swatch: 'dash-post dash-round', label: 'Post-assessment' },
          ]}
        />
        <Dumbbell
          valueLabel="Reached target"
          rows={[...data.cohorts]
            .sort(
              (a, b) =>
                a.provider.localeCompare(b.provider) ||
                (a.startsAt ?? '').localeCompare(b.startsAt ?? '')
            )
            .map((c) => ({
              key: c.cohortId,
              label: c.cohort,
              sub: c.status === 'running' ? 'In progress' : `Ended ${dateShort(c.endsAt)}`,
              group: c.provider,
              pre: c.avgPre,
              post: c.avgPost,
              value: pct(c.targetRate),
            }))}
        />
        <div className="dash-tablewrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th scope="col">Cohort</th>
                <th scope="col">Run by</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Enrolled
                </th>
                <th scope="col">Completion</th>
                <th scope="col" className="num">
                  Change (% points)
                </th>
                <th scope="col" className="num">
                  Ready
                </th>
                <th scope="col">
                  <span className="dash-visually-hidden">Gradebook</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((c) => (
                <tr key={c.cohortId}>
                  <th scope="row">{c.cohort}</th>
                  <td>{c.host}</td>
                  <td className="dash-nowrap">
                    {c.status === 'running' ? 'In progress' : 'Completed'}
                  </td>
                  <td className="num">{c.enrolled}</td>
                  <td>
                    <Meter value={c.completionRate} label="Completion" />
                  </td>
                  <td className="num">{points(c.avgGain)}</td>
                  <td className="num">{c.interviewReady}</td>
                  <td>
                    <a href={href(`/dashboard/cohorts/${encodeURIComponent(c.cohortId)}`)}>
                      Gradebook<span className="dash-visually-hidden"> for {c.cohort}</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
