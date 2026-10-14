import type { Register } from 'claude-code'
import {
  agyCall, agyHooksJson, agyInputText, AGY_INPUT, blockedFiles, clip, codexCall, diffArgv, failure, fileListArgvs, header,
  KILL_GRACE_SEC, MAX_REPLY, PREFLIGHT, TOOL, TOOL_NAME, UNTRACKED_DIFF, validate, WRITE_FILE, type Consult,
} from './consult/consult'

// consult: the engine follows `$` only through functions in this file, so the run flow lives here and
// consult/consult.ts holds the pure parts.

// Slack over the CLI's own `timeout`, so the CLI is killed first and process.run only backstops it.
const SETUP_MS = 20000
const slackMs = (c: Consult) => (c.timeoutSec + KILL_GRACE_SEC + 10) * 1000

// A tool error. `tool.call` has no error flag, so the call is refused with the reason as the result.
const fail = (message: string) => ({ deny: message })

const gatePath = ($: any) => `${String($.plugin.root)}/skills/second-opinion/scripts/agy-gate.sh`

async function sh($: any, script: string, args: string[], init: Record<string, unknown> = {}) {
  return $.process.run(['sh', '-c', script, 'sh', ...args], { timeoutMs: SETUP_MS, ...init })
}

// Runs the review and returns the reply text. Throws a plain Error with the tool-error text.
async function consult($: any, c: Consult): Promise<string> {
  const cwd: string = await $.session.cwd()
  const pre = await sh($, PREFLIGHT, [c.repo ?? '', cwd], { cwd })
  if (pre.exitCode !== 0) throw new Error(pre.stderr.trim() || `repo check exited ${pre.exitCode}`)
  const [repo = '', top = ''] = pre.stdout.split('\n')

  if (c.mode === 'diff') {
    if (top === '') throw new Error(`diff mode needs a git repo: ${repo}`)
    let names = ''
    for (const argv of fileListArgvs(c, top)) {
      const out = await $.process.run(argv, { timeoutMs: SETUP_MS })
      if (out.exitCode !== 0) throw new Error(`git exited ${out.exitCode}: ${out.stderr.trim()}`)
      names += out.stdout + '\0'
    }
    if (names.replaceAll('\0', '').trim() === '') throw new Error('no changes found to review')
    const blocked = blockedFiles(names)
    if (blocked.length > 0) throw new Error(`diff touches secret-like files, not sending: ${blocked.join(' ')}`)
  }

  const run = c.cli === 'codex' ? () => runCodex($, c, repo) : () => runAgy($, c, repo, top)
  const out = await run()
  if (out.exitCode !== 0 || out.stdout.trim() === '') throw new Error(failure(c, out.exitCode, out.stdout, out.stderr))
  return `${header(c, repo)}\n${clip(out.stdout.trim(), MAX_REPLY, 'reply')}`
}

function runCodex($: any, c: Consult, repo: string) {
  const call = codexCall(c, repo)
  return $.process.run(call.argv, { cwd: call.cwd, stdin: call.stdin, timeoutMs: slackMs(c) })
}

async function runAgy($: any, c: Consult, repo: string, top: string) {
  const made = await $.process.run(['mktemp', '-d', '-t', 'second-opinion.XXXXXX'], { timeoutMs: SETUP_MS })
  const ws = made.stdout.trim()
  if (made.exitCode !== 0 || !ws.startsWith('/')) throw new Error(`mktemp failed: ${made.stderr.trim()}`)
  try {
    const put = async (path: string, text: string) => {
      const w = await sh($, WRITE_FILE, [path], { stdin: text })
      if (w.exitCode !== 0) throw new Error(`could not write ${path}: ${w.stderr.trim()}`)
    }
    await put(`${ws}/.agents/hooks.json`, agyHooksJson(gatePath($)))
    let diff = ''
    if (c.mode === 'diff') {
      const tracked = await $.process.run(diffArgv(c, top), { timeoutMs: SETUP_MS * 3 })
      if (tracked.exitCode !== 0) throw new Error(`git exited ${tracked.exitCode}: ${tracked.stderr.trim()}`)
      diff = tracked.stdout
      if (!c.base && !c.commit) diff += (await sh($, UNTRACKED_DIFF, [top], { timeoutMs: SETUP_MS * 3 })).stdout
    }
    await put(`${ws}/${AGY_INPUT}`, agyInputText(c, diff))
    const call = agyCall(c, repo, ws)
    return await $.process.run(call.argv, { cwd: call.cwd, timeoutMs: slackMs(c) })
  } finally {
    try {
      await $.process.run(['rm', '-rf', ws], { timeoutMs: SETUP_MS })
    } catch (err) {
      $.ui.log(`consult: could not remove ${ws}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.tool.register(TOOL)
    } catch (err) {
      $.ui.log(`consult: ${err instanceof Error ? err.message : String(err)}`)
    }
    return next(e)
  })
  on('tool.call', async ($, e: any, next) => {
    if (e.tool !== TOOL_NAME) return next(e)
    const checked = validate(e)
    if ('error' in checked) return fail(`consult: ${checked.error}`)
    // Answering the call here skips the engine's own permission step, so ask for its verdict first.
    try {
      const { tool, tool_use_id, ...args } = e
      const verdict: any = await $.tool.check({ tool: TOOL_NAME, input: args })
      if (verdict.decision === 'ask') {
        const what = `${checked.ok.cli} ${checked.ok.mode} review of ${checked.ok.repo ?? 'the session repo'}`
        const answer = await $.ui.ask(`Send code to an outside model (${what})?`, ['Allow', 'Deny']).catch(() => 'unavailable')
        if (answer === 'unavailable') return fail('consult: needs approval and nobody can be asked here; allow mcp__review__consult to run it unattended')
        if (answer !== 'Allow') return fail('consult: not approved')
      } else if (verdict.decision !== 'allow') {
        return fail(`consult: not permitted${verdict.reason ? `: ${verdict.reason}` : ''}`)
      }
    } catch (err) {
      return fail(`consult: permission check failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    try {
      return { result: await consult($, checked.ok) }
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  })
}
