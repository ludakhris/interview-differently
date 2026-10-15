import { createHash } from 'node:crypto'
import { MAX_ANSWER_CHARS } from '../../simulator/interview-engine/interview-engine'
import type { ScoredAnswer } from '../../simulator/interview-engine/interview-engine'

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

// ── LTI platform storage (1EdTech "LTI Client Side postMessages", issue #90) ──────────────────────
//
// A launch in a frame cannot count on the cross-site `lti_state` cookie, so the login state is also kept in the
// platform's page (the frame's parent): `lti.put_data` before the login goes on, `lti.get_data` when the launch comes
// back. Messages go only to, and are only accepted from, the platform origin the tool trusts.

/**
 * CSP for a page whose one inline script carries `nonce`. Its form may post to the tool only; `formAction` adds the
 * origins a post's redirect may go on to (Chrome checks form-action on those redirects too).
 */
export const scriptCsp = (nonce: string, formAction: string[] = []): string =>
  `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action ${["'self'", ...formAction].join(' ')}`

/** JSON safe inside a <script type="application/json"> block. */
const scriptJson = (v: unknown): string =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

/** How long a page waits for the platform to answer before it gives up. */
export const STORAGE_WAIT_MS = 3000

// The frame the platform named (`_parent`, or a frame of the parent by name), and a message id.
const TARGET_JS =
  `var c=JSON.parse(document.getElementById('lti-storage').textContent);` +
  `var t=null;try{t=c.target==='_parent'?window.parent:window.parent.frames[c.target]}catch(x){}` +
  `var id='id-'+Date.now()+'-'+Math.random().toString(36).slice(2);`

/** Puts the login state in platform storage, then goes on to the platform's login (whatever the answer). */
export const PUT_SCRIPT =
  `(function(){${TARGET_JS}var left=false;` +
  `function go(){if(left)return;left=true;window.location.replace(c.next)}` +
  `window.addEventListener('message',function(e){var d=e.data;` +
  `if(e.origin!==c.origin||e.source!==t||!d||d.subject!=='lti.put_data.response'||d.message_id!==id)return;go()});` +
  `setTimeout(go,c.waitMs);` +
  `try{if(!t||t===window)return go();t.postMessage({subject:'lti.put_data',message_id:id,key:c.key,value:c.value},c.origin)}catch(x){go()}})();`

/** Reads the login state back from platform storage and posts it with the launch, or says it could not. */
export const GET_SCRIPT =
  `(function(){${TARGET_JS}var done=false;` +
  `function fail(){if(done)return;done=true;document.getElementById('wait').hidden=true;document.getElementById('fail').hidden=false}` +
  `window.addEventListener('message',function(e){var d=e.data;` +
  `if(done||e.origin!==c.origin||e.source!==t||!d||d.subject!=='lti.get_data.response'||d.message_id!==id)return;` +
  `if(d.key!==c.key||typeof d.value!=='string'||!d.value)return fail();` +
  `done=true;var f=document.forms[0];f.elements.lti_storage_value.value=d.value;f.submit()});` +
  `setTimeout(fail,c.waitMs);` +
  `try{if(!t||t===window)return fail();t.postMessage({subject:'lti.get_data',message_id:id,key:c.key},c.origin)}catch(x){fail()}})();`

export interface StorageTarget {
  /** `_parent`, or the name of a frame of the parent. */
  target: string
  /** The platform page's origin: the only one messages are sent to and accepted from. */
  origin: string
}

export const storagePutPage = (
  a: StorageTarget & { nonce: string; key: string; value: string; next: string }
): string =>
  page(
    'Opening',
    `<p>Opening…</p>` +
      `<script type="application/json" id="lti-storage">${scriptJson({ target: a.target, origin: a.origin, key: a.key, value: a.value, next: a.next, waitMs: STORAGE_WAIT_MS })}</script>` +
      `<script nonce="${esc(a.nonce)}">${PUT_SCRIPT}</script>`
  )

export const storageGetPage = (
  a: StorageTarget & { nonce: string; key: string; action: string; idToken: string; state: string }
): string =>
  page(
    'Opening',
    `<p id="wait">Opening…</p>` +
      `<p id="fail" class="err" role="alert" hidden>This launch could not be confirmed in this browser. Reload the course page and open it again.</p>` +
      `<form method="post" action="${esc(a.action)}">` +
      `<input type="hidden" name="id_token" value="${esc(a.idToken)}">` +
      `<input type="hidden" name="state" value="${esc(a.state)}">` +
      `<input type="hidden" name="lti_storage_value" value=""></form>` +
      `<script type="application/json" id="lti-storage">${scriptJson({ target: a.target, origin: a.origin, key: a.key, waitMs: STORAGE_WAIT_MS })}</script>` +
      `<script nonce="${esc(a.nonce)}">${GET_SCRIPT}</script>`
  )
