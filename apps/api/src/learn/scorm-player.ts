import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * The page a SCORM package runs inside, stored next to the packages so it shares their origin (the public media
 * host in production), never the Learn Differently origin. It gives the package scorm-again's CrossFrameAPI as
 * window.API / window.API_1484_11; every call goes to the real SCORM API in the Learn page by postMessage
 * (CrossFrameLMS there). The package therefore cannot reach the learner's page, session or storage.
 *
 * Opened as <player>#e=<packageId>/<entry>&o=<Learn origin>. The package loads in a frame inside this page, so it
 * finds the API on its parent window as SCORM expects.
 */
export const PLAYER_KEY = '_player/v1.html'

/** Where packages and the player page are served: the public media host in production, this API elsewhere. */
export function scormBaseUrl(): string {
  if (process.env.NODE_ENV === 'production')
    return `${(process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')}/learn-scorm`
  const api = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`
  return `${api.replace(/\/$/, '')}/api/scorm-files`
}

/**
 * The launch address of a package: the player page, told which package file to open. The Learn page adds its own
 * origin (o=) before loading it.
 */
export function scormSrc(packageId: string, entry: string): string {
  const [path, query] = entry.split('?')
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const target = `${packageId}/${encoded}${query ? `?${query}` : ''}`
  return `${scormBaseUrl()}/${PLAYER_KEY}#e=${encodeURIComponent(target)}`
}

let crossFrameApi: string | undefined

/** scorm-again's browser build of CrossFrameAPI (an IIFE that defines a global CrossFrameAPI). */
function crossFrameApiScript(): string {
  crossFrameApi ??= readFileSync(
    join(dirname(require.resolve('scorm-again')), '..', 'cross-frame-api.min.js'),
    'utf8'
  )
  return crossFrameApi
}

const BOOT = `
(function () {
  var q = new URLSearchParams(location.hash.slice(1));
  var origin = q.get('o') || '';
  var entry = q.get('e') || '';
  if (!/^https?:\\/\\/[^/]+$/.test(origin)) return;
  if (!/^[0-9a-f-]{36}\\/[^?#]+/.test(entry) || entry.indexOf('..') !== -1) return;
  var api = new CrossFrameAPI(origin, window.parent);
  window.API = api;
  window.API_1484_11 = api;
  var frame = document.createElement('iframe');
  frame.title = 'Course content';
  frame.src = '../' + entry;
  document.body.appendChild(frame);
})();
`

export function scormPlayerHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Course content</title>
<style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:0;display:block}</style>
<script>${crossFrameApiScript()}</script>
</head>
<body>
<script>${BOOT}</script>
</body>
</html>
`
}
