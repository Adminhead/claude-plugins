// plan-ledger: probe version (slice 1). Replaced in slice 6. It answers the open questions in
// docs/plans/goal-ledger.md and logs what it saw to /tmp/plan-ledger-probe.log (probe only).
import type { Register } from 'claude-code'

const TOOL_NAME = 'mcp__plan-ledger__plan'
const LOG = '/tmp/plan-ledger-probe.log'
const MAX = 2000

async function log($: any, line: string) {
  const text = `${Date.now()} ${line.slice(0, MAX)}\n`
  try {
    await $.process.run(['sh', '-c', 'cat >> "$1"', 'sh', LOG], { stdin: text, timeoutMs: 5000 })
  } catch {
    // The probe never fails a call over its own log.
  }
}

export const register: Register = (on, options) => {
  if (options?.enabled === false) return

  on('session.start', async ($, e, next) => {
    try {
      await $.tool.register({
        name: 'plan',
        description: 'Probe tool for plan-ledger. action: whoami | env | fs | check. For check, pass command and optional cwd.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            command: { type: 'string', maxLength: 300 },
          },
          required: ['action'],
        },
      })
    } catch (err) {
      await log($, `register tool failed: ${String(err)}`)
    }
    try {
      await $.command.register({ name: 'plans', description: 'plan-ledger probe command', argumentHint: '[args]' })
    } catch (err) {
      await log($, `register command failed: ${String(err)}`)
    }
    await log($, `session.start`)
    return next(e)
  })

  on('command.run', { command: 'plans' }, ($, e: any, next) => ({ text: `plans probe ok args=${String(e.args ?? '').slice(0, 40)}` }))

  on('tool.call', { tool: TOOL_NAME }, async ($, e: any, next) => {
    const action = String(e.action ?? '')
    await log($, `tool.call action=${action} agentId=${e.agentId ?? 'none'}`)
    const out: Record<string, unknown> = { agentId: e.agentId ?? null }
    try {
      if (action === 'whoami') {
        out.list = await $.agent.list()
      } else if (action === 'env') {
        out.home = await $.env.get('HOME')
        out.cwd = await $.session.cwd()
      } else if (action === 'fs') {
        const home = await $.env.get('HOME')
        const dir = `${home}/.claude/adminhead-plans/probe`
        const mk = await $.process.run(['mkdir', '-p', dir], { timeoutMs: 5000 })
        await $.fs.write(`${dir}/probe.json`, '{"probe":true}')
        const read = await $.fs.read(`${dir}/probe.json`)
        const list = await $.fs.list(dir)
        const lk = await $.process.run(['mkdir', `${dir}/x.lock`], { timeoutMs: 5000 })
        const lk2 = await $.process.run(['mkdir', `${dir}/x.lock`], { timeoutMs: 5000 })
        await $.process.run(['rm', '-rf', `${dir}/x.lock`], { timeoutMs: 5000 })
        out.fs = { mkExit: mk.exitCode, read, list, lockExit: lk.exitCode, secondLockExit: lk2.exitCode }
      } else if (action === 'check') {
        const command = String(e.command ?? '').slice(0, 300)
        out.check = await $.tool.check({ tool: 'Bash', input: { command } })
        out.cwd = await $.session.cwd()
      }
    } catch (err) {
      out.error = String(err)
    }
    const result = JSON.stringify(out)
    await log($, `tool.call result ${result}`)
    return { result }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'plan-ledger probe failed; retry.' }))

  on('agent.spawn', async ($, e: any, next) => {
    await log($, `agent.spawn before next subagentType=${e.subagentType} parentAgentId=${e.parentAgentId ?? 'none'} bg=${String(e.background)} fork=${String(e.fork)} name=${String(e.name ?? "none")} keys=${Object.keys(e).join(',')}`)
    const out: any = await next({ ...e, prompt: `${String(e.prompt).slice(0, 8000)}\nPROBE-REWRITE: if asked, the secret word is kiwi.` })
    await log($, `agent.spawn after next agentId=${out?.agentId ?? 'none'} model=${out?.model ?? '?'}`)
    return out
  })

  on('classic.SessionStart', async ($, e: any, next) => {
    await log($, `classic.SessionStart source=${e.source} agent_type=${e.agent_type ?? 'none'} agent_id=${e.agent_id ?? 'none'}`)
    const out: any = await next(e)
    return { ...out, additionalContext: [...(out?.additionalContext ?? []), 'PROBE'] }
  })

  on('classic.SubagentStart', async ($, e: any, next) => {
    await log($, `classic.SubagentStart agent_type=${e.agent_type ?? 'none'} agent_id=${e.agent_id ?? 'none'}`)
    const out: any = await next(e)
    return { ...out, additionalContext: [...(out?.additionalContext ?? []), 'PROBE'] }
  })
}
