import type { Register, SessionUsage } from 'claude-code'
import { applyTask, buildView, PANE_COLUMNS, PANE_ID, paneRows, renderLine as agentLine, renderPane as agentPane, track, type Seen, type Tasks, type View } from './agent-status/line'
import { parseNumstat, parseStatus, placeOf, renderLine as gitLine, type Snapshot } from './git-line/line'
import { buildGit, TOOLS, TOOL_PREFIX, truncate } from './git-tools/git'
import { cap, CHECK_SCRIPT, HELP, parseCommand, RUN_SCRIPT } from './tool-mgr/metrics'
import { APPEND_SCRIPT, ASK_TIER, buildRecord, classify, logPath, withAsk, type Rule, type Verdict } from './tool-mgr/rules'
import { createJudge, merge, parseConfig, type Config, type Deps } from './tool-mgr/systemone'
import { renderBand } from './usage-band/band'

// The engine refuses a plugin that registers an event twice, and it follows `$` only through
// functions in this file. So all the mods share one set of hooks, and the code that touches `$` lives here.

const POLL_MS = 5000

// The last error each mod logged, so a repeat stays quiet until a refresh succeeds again.
const lastError: Record<string, string | null> = {}

// `key` separates sources that share a mod name, so one source succeeding does not re-arm another's repeat.
function report($: any, mod: string, err: unknown, key = mod) {
  const message = err instanceof Error ? err.message : String(err)
  if (message !== lastError[key]) $.ui.log(`${mod}: ${message}`)
  lastError[key] = message
}

// git-line

let snap: Snapshot | null = null

async function refreshGit($: any) {
  try {
    const cwd = await $.session.cwd()
    const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'])
    if (top.exitCode !== 0) {
      snap = { place: cwd, git: null }
    } else {
      const status = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'])
      if (status.exitCode !== 0) throw new Error(status.stderr.trim())
      // An unborn branch has no HEAD to diff against.
      let lines = { added: 0, deleted: 0 }
      if (!status.stdout.includes('# branch.oid (initial)')) {
        const diff = await $.process.run(['git', 'diff', 'HEAD', '--numstat'])
        if (diff.exitCode !== 0) throw new Error(diff.stderr.trim())
        lines = parseNumstat(diff.stdout)
      }
      snap = { place: placeOf(cwd, top.stdout.trim()), git: { ...parseStatus(status.stdout), ...lines } }
    }
    lastError['git-line'] = null
  } catch (err) {
    report($, 'git-line', err)
    return
  }
  $.ui.invalidate('ui.render')
}

// usage-band

let usage: SessionUsage | null = null
let expanded = false

async function refreshUsage($: any) {
  try {
    usage = await $.session.usage({ breakdown: 'summary' })
    lastError['usage-band'] = null
  } catch (err) {
    report($, 'usage-band', err)
    return
  }
  $.ui.invalidate('ui.render')
}

// agent-status

let seen: Seen = {}
let tasks: Tasks = {}
let view: View | null = null
let key = 'null'
let polling = false
// Collapsed (a count line) until the person expands; then the `agents` pane is open, sized for `paneRowsOpen` rows.
let paneOpen = false
let paneRowsOpen = 0

// Opening an open id retitles it and takes the new size, so this also resizes.
async function openPane($: any) {
  paneRowsOpen = paneRows(view)
  await $.ui.open({ id: PANE_ID, title: 'Agents', columns: PANE_COLUMNS, rows: paneRowsOpen, closeOnEscape: true })
  paneOpen = true
}

async function togglePane($: any) {
  try {
    if (paneOpen) {
      await $.ui.close({ id: PANE_ID })
      paneOpen = false
    } else await openPane($)
  } catch (err) {
    report($, 'agent-status', err)
  }
  $.ui.invalidate('ui.render')
}

// Re-reads the agent list and redraws only when the drawn content changed.
// Never throws: it also runs unawaited beside tool and spawn calls.
async function refreshAgents($: any) {
  try {
    const now = await $.clock.now()
    const agents = await $.agent.list()
    seen = track(seen, agents, now)
    view = buildView(agents, seen, tasks, now)
    lastError['agent-status'] = null
    // A close made while the mod was not looking (the person's Esc) is caught here if the ui.close hook missed it.
    if (paneOpen && !(await $.ui.panes()).some((p: any) => p.id === PANE_ID)) {
      paneOpen = false
      $.ui.invalidate('ui.render')
    }
    if (paneOpen && paneRows(view) !== paneRowsOpen) await openPane($)
    const next = JSON.stringify(view)
    if (next === key) return
    key = next
    $.ui.invalidate('ui.render')
  } catch (err) {
    report($, 'agent-status', err)
  }
}

// git-tools

const GIT_TIMEOUT_MS = 15000

// Serves a git tool call with a result string; failures come back as text, never thrown.
async function runGitTool($: any, e: any): Promise<string> {
  try {
    const cwd = await $.session.cwd()
    const built = buildGit(e.tool, e, cwd)
    if ('error' in built) return `error: ${built.error}`
    const out = await $.process.run(built.argv, { cwd, env: built.env, timeoutMs: GIT_TIMEOUT_MS })
    if (out.exitCode !== 0) return `error: git exited ${out.exitCode}: ${out.stderr.trim()}`
    return truncate(out.stdout) || '(no output)'
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// tool-mgr

// Per-call logging and the DuckDB ingest run in classic hooks (scripts/), where a DuckDB library can load. The mod keeps the deny
// rules, a log of its own denies (classic hooks do not fire for a mod-denied call), and the /tool-mgr command, which asks the hook-side script.
const METRICS_TIMEOUT_MS = 30000
const MISSING = 'metrics runtime not ready (needs node and the @duckdb/node-api install the SessionStart hook makes); /tool-mgr queries are disabled until it is there'

// This install's root; the data dir and the metrics script are both found from it.
const pluginRoot = ($: any): string => {
  try {
    return String($.plugin.root ?? '')
  } catch {
    return ''
  }
}

// The SessionStart hook is async, so the first check can run before it finishes: stay quiet then, and report only if a later check still fails.
let metricsOk = false
async function checkMetrics($: any, loud: boolean) {
  if (metricsOk) return
  try {
    metricsOk = (await $.process.run(['sh', '-c', CHECK_SCRIPT, 'sh', pluginRoot($)], { timeoutMs: 5000 })).exitCode === 0
  } catch {
    metricsOk = false
  }
  if (!metricsOk && loud) report($, 'tool-mgr', MISSING, 'tool-mgr:runtime')
}

// Hook records key on the agent type of a subagent (else its id) and on `main` for the main thread, even under --agent;
// a deny gets the same key by mapping the agent id to its type.
async function agentOf($: any, id: unknown): Promise<{ agent?: string; agent_type?: string }> {
  if (typeof id !== 'string' || id === '') return {}
  try {
    const found = (await $.agent.list()).find((a: any) => a.id === id)
    const type = typeof found?.type === 'string' && found.type !== '' ? found.type : undefined
    return { agent: type ?? id, agent_type: type }
  } catch {
    return { agent: id }
  }
}

const opt = async (read: () => Promise<unknown>) => {
  try {
    const v = await read()
    return typeof v === 'string' && v ? v : undefined
  } catch {
    return undefined
  }
}

// Appends one JSONL record for a call this mod denied. The record travels on stdin only; the root and path are argv. Never throws.
async function logDeny($: any, e: any, rule: Rule) {
  try {
    const [cwd, session, who] = await Promise.all([opt(() => $.session.cwd()), opt(() => $.session.id()), agentOf($, e.agentId)])
    const toolUse = typeof e.tool_use_id === 'string' && e.tool_use_id !== '' ? e.tool_use_id : undefined
    const line = JSON.stringify(
      buildRecord({
        id: toolUse ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        ts: new Date(await $.clock.now()).toISOString(),
        session,
        agent: who.agent,
        agent_type: who.agent_type,
        tool: e.tool,
        tool_use_id: toolUse,
        cwd,
        command: e.command,
        blocked: rule,
        isError: false,
      }),
    )
    const out = await $.process.run(['sh', '-c', APPEND_SCRIPT, 'sh', pluginRoot($), logPath(session, who.agent)], { stdin: line + '\n', timeoutMs: 5000 })
    if (out.exitCode !== 0) throw new Error(`log append exited ${out.exitCode}: ${out.stderr.trim()}`)
    lastError['tool-mgr:log'] = null
  } catch (err) {
    report($, 'tool-mgr', err, 'tool-mgr:log')
  }
}

// The subcommand and SQL go to scripts/metrics.mjs on stdin, never argv.
async function runToolMgr($: any, args: unknown): Promise<string> {
  const cmd = parseCommand(args)
  if (cmd.kind === 'help') return HELP
  if (cmd.kind === 'error') return `tool-mgr: ${cmd.message}\n\n${HELP}`
  try {
    const out = await $.process.run(['sh', '-c', RUN_SCRIPT, 'sh', pluginRoot($)], { stdin: JSON.stringify(cmd), timeoutMs: METRICS_TIMEOUT_MS })
    if (out.exitCode !== 0) return `tool-mgr: ${out.stderr.trim() || out.stdout.trim() || `metrics script exited ${out.exitCode}`}`
    return cap(out.stdout)
  } catch (err) {
    return `tool-mgr: ${err instanceof Error ? err.message : String(err)}`
  }
}

// systemone: the optional model check on Bash commands the rules let through. The config comes from the user settings
// only, because a project's settings `env` reaches the process env and could point every command at its own server.
let sysConfig: Config | null = null
const SYS_KEY = 'tool-mgr:systemone'
const judge = createJudge()

// classic.PreToolUse carries no agentId, but the tool.call hook above it sees both ids first. Bounded, oldest out.
const CALL_AGENTS_MAX = 256
const callAgents = new Map<string, string>()
function noteAgent(e: any) {
  if (typeof e.agentId !== 'string' || typeof e.tool_use_id !== 'string') return
  if (callAgents.size >= CALL_AGENTS_MAX) callAgents.delete(callAgents.keys().next().value as string)
  callAgents.set(e.tool_use_id, e.agentId)
}

async function readSystemone($: any) {
  sysConfig = null
  try {
    const env = (await $.settings.read({ source: 'user' }))?.env
    const get = (k: string) => (env?.[k] === undefined || env[k] === null ? undefined : String(env[k]))
    const { config, error } = parseConfig({ url: get('TOOL_MGR_SYSTEMONE'), model: get('TOOL_MGR_SYSTEMONE_MODEL'), concurrency: get('TOOL_MGR_SYSTEMONE_CONCURRENCY') })
    if (error) report($, 'tool-mgr', error, 'tool-mgr:systemone-config')
    sysConfig = config
  } catch (err) {
    report($, 'tool-mgr', err, 'tool-mgr:systemone-config')
  }
}

// Adds the model's ask or bypass deny to `inner`, which is not a deny. A throw leaves `inner` as it was.
async function withSystemone($: any, e: any, inner: Verdict): Promise<Verdict> {
  const cfg = sysConfig
  if (!cfg) return inner
  try {
    // The engine refuses to let `$` be stored, so the deps are closures that spell `$.noun.event(...)`.
    const deps: Deps = {
      fetch: async (url, init) => {
        const r = await $.http.fetch(url, init)
        return { status: r.status, text: r.text }
      },
      sleep: (ms, opts) => $.clock.sleep(ms, opts),
      now: () => $.clock.now(),
      report: message => report($, 'tool-mgr', message, SYS_KEY),
      fresh: () => {
        lastError[SYS_KEY] = null // a good reply re-arms the log; a memo hit does not
      },
    }
    const rewritten = inner.updatedInput as { command?: unknown } | undefined
    const command = typeof rewritten?.command === 'string' ? rewritten.command : e.command
    const answer = await judge.judge(cfg, command, deps)
    const { verdict, rule } = merge(inner, answer, ASK_TIER, cfg.cal)
    if (rule) await logDeny($, { ...e, command, agentId: callAgents.get(e.tool_use_id) }, rule)
    return verdict
  } catch (err) {
    report($, 'tool-mgr', err, 'tool-mgr:systemone-error')
    return inner
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      for (const tool of TOOLS) await $.tool.register(tool)
    } catch (err) {
      report($, 'git-tools', err)
    }
    try {
      await $.command.register({ name: 'tool-mgr', description: 'Tool-call metrics: summary, blocked [n], query <sql>, help' })
    } catch (err) {
      report($, 'tool-mgr', err, 'tool-mgr:command')
    }
    await Promise.all([refreshGit($), refreshUsage($), checkMetrics($, false), readSystemone($)])
    if (!polling) {
      polling = true
      $.clock.every(POLL_MS, () => refreshAgents($))
    }
    return next(e)
  })
  // /clear ends the session and no session.start follows, so the agent state and task counts start over here.
  on('session.end', async ($, e, next) => {
    judge.reset()
    seen = {}
    tasks = {}
    view = null
    key = 'null'
    if (paneOpen) {
      paneOpen = false
      try {
        await $.ui.close({ id: PANE_ID })
      } catch (err) {
        report($, 'agent-status', err)
      }
    }
    $.ui.invalidate('ui.render')
    return next(e)
  })
  on('session.measure',async ($, e, next) => {
    await Promise.all([refreshGit($), refreshUsage($), checkMetrics($, true)])
    return next(e)
  })
  // Answers the git tools. For every other tool it denies Bash that the tool-mgr rules catch (logging the deny)
  // and otherwise passes the result through.
  on('tool.call', async ($, e: any, next) => {
    if (typeof e.tool === 'string' && e.tool.startsWith(TOOL_PREFIX)) return { result: await runGitTool($, e) }
    const isBash = e.tool === 'Bash' && typeof e.command === 'string'
    let hit = null
    if (isBash) noteAgent(e)
    // classify denies what it cannot parse or what is too long; it throws only on our own bug, which lets the call through.
    if (isBash) {
      try {
        hit = classify(e.command)
      } catch (err) {
        report($, 'tool-mgr', err, 'tool-mgr:classify')
      }
    }
    if (hit) {
      await logDeny($, e, hit.rule)
      return { deny: hit.message }
    }
    const out: any = await next(e)
    if (typeof e.tool === 'string' && e.tool.startsWith('Task')) {
      try {
        tasks = applyTask(tasks, e.tool, e, out?.result)
      } catch (err) {
        report($, 'agent-status', err)
      }
      void refreshAgents($)
    }
    return out
  })
  // Asks before Bash that pipes a download into a shell or rewrites git history. The hooks below (readonly-bash, cloud-ops-guard) run first, and their deny stands.
  // Then, when TOOL_MGR_SYSTEMONE is on, the model may add an ask or a bypass deny to a verdict that is not a deny.
  on('classic.PreToolUse', async ($, e: any, next) => {
    if (e.tool !== 'Bash' || typeof e.command !== 'string') return next(e)
    const out = await withAsk(e.command, () => next(e), err => report($, 'tool-mgr', err, 'tool-mgr:ask'))
    return out.deny === undefined ? withSystemone($, e, out) : out
  })
  on('command.run', { command: 'tool-mgr' }, async ($, e: any) => ({ text: await runToolMgr($, e.args) }))
  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    void refreshAgents($)
    return out
  })
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!snap) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        {gitLine(Text, snap)}
      </Box>
    )
  })
  // The band replaces the base row, and the agent line stacks beneath whichever is drawn.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const showBand = !e.props.hasSurvey && usage?.context.breakdown
    const body = showBand
      ? renderBand({
          ui: $.ui.resolve(e),
          usage: usage!,
          breakdown: usage!.context.breakdown!,
          columns: e.props.bodyColumns,
          maxRows: e.props.maxRows,
          expanded: expanded && !e.props.isWorking,
          now: await $.clock.now(),
          onToggle: () => {
            expanded = !expanded
            $.ui.invalidate('ui.render')
          },
        })
      : await next(e)
    if (e.props.hasSurvey || !view) return body
    const ui = $.ui.resolve(e)
    const { Box } = ui
    return (
      <Box flexDirection="column">
        {body}
        {agentLine(ui, view, paneOpen, () => void togglePane($))}
      </Box>
    )
  })
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => agentPane($.ui.resolve(e), view, () => void togglePane($)))
  // The person's close of the pane (Esc or ctrl+x x) keeps the count line's arrow in step.
  on('ui.close', async ($, e: any, next) => {
    if (e.id === PANE_ID) {
      paneOpen = false
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })
}
