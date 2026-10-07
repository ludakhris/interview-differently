import { createHash } from 'node:crypto'
import { MAX_ANSWER_CHARS } from '../../interview-engine/interview-engine'
import type { ScoredAnswer } from '../../interview-engine/interview-engine'

/** Escapes a value for use in HTML text or a double-quoted attribute. */
export const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>` +
  `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#111}` +
  `textarea{width:100%;box-sizing:border-box;font:inherit;padding:.5rem}` +
  `button,a.btn{font:inherit;padding:.6rem 1.2rem;background:#1d4ed8;color:#fff;border:0;border-radius:4px;text-decoration:none;display:inline-block}` +
  `label{display:block;font-weight:600;margin:1.25rem 0 .25rem}` +
  `.err{border-left:4px solid #b91c1c;padding:.5rem 1rem;background:#fef2f2}` +
  `</style></head><body><main>${body}</main></body></html>`

export const interviewPage = (a: {
  action: string
  submission: string
  role: string
  questions: string[]
}): string =>
  page(
    'Interview',
    `<h1>Interview${a.role ? `: ${esc(a.role)}` : ''}</h1>` +
      `<form method="post" action="${esc(a.action)}">` +
      `<input type="hidden" name="submission" value="${esc(a.submission)}">` +
      a.questions
        .map(
          (q, i) =>
            `<label for="answer_${i}">${i + 1}. ${esc(q)}</label>` +
            `<textarea id="answer_${i}" name="answer_${i}" rows="6" maxlength="${MAX_ANSWER_CHARS}" required></textarea>`
        )
        .join('') +
      `<p><button type="submit">Submit answers</button></p></form>`
  )

export const resultPage = (a: {
  score: number
  dimensions: { dimension: string; score: number }[]
  answers: ScoredAnswer[]
  questions: string[]
  returnUrl: string
}): string =>
  page(
    'Interview result',
    `<h1>Interview result</h1><p>Overall score: <strong>${esc(a.score)}</strong> / 100. It has been sent to your course.</p>` +
      `<p><a class="btn" href="${esc(a.returnUrl)}">Back to your course</a></p>` +
      `<h2>By dimension</h2><ul>${a.dimensions.map((d) => `<li>${esc(d.dimension)}: ${esc(d.score)}</li>`).join('')}</ul>` +
      `<h2>Feedback</h2>` +
      a.answers
        .map(
          (r, i) =>
            `<h3>${i + 1}. ${esc(a.questions[i])}</h3><p>Score: ${esc(r.score)}</p>` +
            `<p>${esc(r.feedback)}</p>` +
            (r.strengths ? `<p>Strengths: ${esc(r.strengths)}</p>` : '') +
            (r.development ? `<p>To develop: ${esc(r.development)}</p>` : '')
        )
        .join('')
  )

export const errorPage = (message: string, returnUrl?: string): string =>
  page(
    'Something went wrong',
    `<h1>Something went wrong</h1><p class="err" role="alert">${esc(message)}</p>` +
      (returnUrl ? `<p><a href="${esc(returnUrl)}">Back to your course</a></p>` : '')
  )

/** Tells the platform's registration window it may close (LTI Dynamic Registration 1.0, section 3.5). */
export const CLOSE_SCRIPT = `try{(window.opener||window.parent).postMessage({subject:'org.imsglobal.lti.close'},'*')}catch(e){}`
/** The page's own script is the only one its CSP allows. */
export const CLOSE_SCRIPT_CSP = `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${createHash('sha256').update(CLOSE_SCRIPT).digest('base64')}'`

export const registeredPage = (name: string, created: boolean): string =>
  page(
    'Registered',
    `<h1>Interview Differently is ${created ? 'registered' : 'already registered'}</h1>` +
      `<p>${esc(name)} is ${created ? 'now' : 'already'} connected to Interview Differently, ` +
      `and is waiting for approval. An administrator of Interview Differently has to approve it ` +
      `before learners can launch from it. You can close this window.</p>` +
      `<script>${CLOSE_SCRIPT}</script>`
  )
