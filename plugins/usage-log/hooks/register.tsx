import type { Register } from 'claude-code'
import { commandsOf, listingKey, listingOf, parseOptions, slashCommand } from './events'
import { appendArgv, line, logFile, pruneArgv } from './log/usagelog'

// Logs what usage-report needs to judge skill routing: each user prompt, the skill listing the model saw, every skill
// expansion and Skill or Agent tool call, with session, agent and prompt numbers to join them. Lines go to the shared
// usage log (./log/usagelog, stream `usage-log`); the pure pieces are in ./events. Logging never changes an event.

// Per session: the user prompt number skill events belong to, and the listing last logged.
let promptNo = 0
let lastListing = ''
let lastError: string | null = null

function report($: any, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (message !== lastError) $.ui.log(`usage-log: ${message}`, { to: 'debug' })
  lastError = message
}

async function write($: any, kind: string, fields: Record<string, unknown>) {
  try {
    const now = await $.clock.now()
    const r = await $.process.run(appendArgv(logFile('usage-log', now)), { stdin: line(kind, { session: await $.session.id(), ...fields }, now), timeoutMs: 5000 })
    if (r.exitCode !== 0) report($, `append failed: ${r.stderr.trim() || `exit ${r.exitCode}`}`)
    else lastError = null
  } catch (err) {
    report($, err)
  }
}

// The skill listing as the model sees it now, with the plugin and user commands (plugin skills among them), logged
// when it differs from the last one this session logged.
async function logListing($: any) {
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const listing = listingOf(usage?.context?.breakdown?.skills) ?? { total: 0, included: 0, tokens: 0, skills: [] }
    const commands = commandsOf(await $.command.list())
    const key = listingKey(listing, commands)
    if (key === lastListing) return
    lastListing = key
    await write($, 'listing', { prompt: promptNo, ...listing, commands })
  } catch (err) {
    report($, err)
  }
}

export const register: Register = (on, options) => {
  const o = parseOptions(options)

  on('session.start', async ($, e, next) => {
    const out = await next(e)
    promptNo = 0
    lastListing = ''
    try {
      await $.process.run(pruneArgv(o.retentionDays), { timeoutMs: 10000 })
    } catch (err) {
      report($, err)
    }
    await write($, 'session', { cwd: e.cwd, interactive: e.isInteractive })
    return out
  })

  // Logged before the prompt goes on, so the skill events of its turn carry its number.
  on('prompt.submit', async ($, e, next) => {
    promptNo++
    await write($, 'prompt', { prompt: promptNo, text: o.promptText ? e.text : undefined, chars: e.text.length, slash: slashCommand(e.text) })
    await logListing($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Every expansion: the Skill tool, a typed /name, or a preload into a subagent.
  on('skill.prompt', async ($, e, next) => {
    const out = await next(e)
    await write($, 'skill', { prompt: promptNo, skill: e.skill })
    return out
  })

  // The model's own choices, with the loop that made them: Skill (which skill) and Agent (which agent type).
  on('tool.call', async ($, e: any, next) => {
    if (e.tool !== 'Skill' && e.tool !== 'Agent') return next(e)
    const out: any = await next(e)
    const outcome = out?.deny !== undefined ? { denied: true } : { isError: out?.isError === true }
    if (e.tool === 'Skill') await write($, 'skill-call', { prompt: promptNo, agentId: e.agentId, skill: e.skill, args: e.args, ...outcome })
    else await write($, 'agent-call', { prompt: promptNo, agentId: e.agentId, type: e.subagent_type ?? 'general-purpose', description: e.description, ...outcome })
    return out
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    await write($, 'session-end', { prompts: promptNo })
    return next(e)
  })
}
