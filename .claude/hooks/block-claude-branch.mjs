// Blocks pushing a branch named claude/… (the name a cloud session starts on). Branch names describe the work, with
// no claude/ prefix (owner's rule, 2026-10-29). Runs before Bash and the GitHub tools that make branches; exit 2 blocks
// the call and tells Claude why. The GitHub ruleset on claude/** is the backstop for anything this misses.
import { execFileSync } from 'node:child_process'

let raw = ''
for await (const chunk of process.stdin) raw += chunk
const { tool_name: tool, tool_input: input = {}, cwd } = JSON.parse(raw || '{}')

const isClaude = (name) => typeof name === 'string' && /^(refs\/heads\/)?claude\//.test(name.trim())
const block = (branch) => {
  console.error(
    `Blocked: "${branch}" starts with claude/. Rename the branch to describe the work, with no claude/ prefix ` +
      '(git branch -m <name>), then push.'
  )
  process.exit(2)
}

if (tool === 'Bash') {
  const command = String(input.command ?? '')
  if (/\bgit\b[^;&|]*\bpush\b/.test(command)) {
    if (/[\s:]claude\//.test(command)) block(command.match(/claude\/\S+/)[0])
    let branch = ''
    try {
      branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd,
        encoding: 'utf8',
      }).trim()
    } catch {
      // Not in a repository: nothing to check.
    }
    if (isClaude(branch)) block(branch)
  }
} else if (isClaude(input.branch)) {
  block(input.branch)
}
