import type { Register, SessionUsage } from 'claude-code'
import { applyTask, buildView, renderLine as agentLine, track, type Seen, type Tasks, type View } from './agent-status/line'
import { parseNumstat, parseStatus, placeOf, renderLine as gitLine, type Snapshot } from './git-line/line'
import { buildGit, TOOLS, TOOL_PREFIX, truncate } from './git-tools/git'
import { renderBand } from './usage-band/band'

// The engine refuses a plugin that registers an event twice, and it follows `$` only through
// functions in this file. So all three mods share one set of hooks, and the code that touches `$` lives here.

const POLL_MS = 5000

// The last error each mod logged, so a repeat stays quiet until a refresh succeeds again.
const lastError: Record<string, string | null> = {}

function report($: any, mod: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (message !== lastError[mod]) $.ui.log(`${mod}: ${message}`)
  lastError[mod] = message
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

// Re-reads the agent list and redraws only when the drawn content changed.
// Never throws: it also runs unawaited beside tool and spawn calls.
async function refreshAgents($: any) {
  try {
    const now = await $.clock.now()
    const agents = await $.agent.list()
    seen = track(seen, agents, now)
    view = buildView(agents, seen, tasks, now)
    lastError['agent-status'] = null
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      for (const tool of TOOLS) await $.tool.register(tool)
    } catch (err) {
      report($, 'git-tools', err)
    }
    await Promise.all([refreshGit($), refreshUsage($)])
    if (!polling) {
      polling = true
      $.clock.every(POLL_MS, () => refreshAgents($))
    }
    return next(e)
  })
  on('session.measure', async ($, e, next) => {
    await Promise.all([refreshGit($), refreshUsage($)])
    return next(e)
  })
  // Answers the git tools; for every other tool it observes only, and the result passes through.
  on('tool.call', async ($, e: any, next) => {
    if (typeof e.tool === 'string' && e.tool.startsWith(TOOL_PREFIX)) return { result: await runGitTool($, e) }
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
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {body}
        {agentLine(Text, view)}
      </Box>
    )
  })
}
