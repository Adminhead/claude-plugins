import type { Register } from 'claude-code'
import { countStashes, parseNumstat, parseRevParse, parseStatus, placeOf, renderLine, thresholdsOf, type Snapshot } from './line'

// Draws a git status line under the engine's prompt hint: place, branch, worktree, ahead/behind,
// dirty counts, changed lines and stashes. The `$` code lives here; parsing and drawing in ./line.

const GIT_TIMEOUT_MS = 10000

let snap: Snapshot | null = null
let lastError: string | null = null

function report($: any, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (message !== lastError) $.ui.log(`git-statusline: ${message}`, { to: 'debug' })
  lastError = message
}

async function refresh($: any) {
  try {
    const cwd = await $.session.cwd()
    const dirs = await $.process.run(
      ['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'],
      { timeoutMs: GIT_TIMEOUT_MS },
    )
    const repo = dirs.exitCode === 0 ? parseRevParse(dirs.stdout) : null
    if (!repo) {
      snap = { place: cwd, git: null }
    } else {
      const status = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { timeoutMs: GIT_TIMEOUT_MS })
      if (status.exitCode !== 0) throw new Error(status.stderr.trim())
      // An unborn branch has no HEAD to diff against.
      const unborn = status.stdout.includes('# branch.oid (initial)')
      const [diff, stash] = await Promise.all([
        unborn ? null : $.process.run(['git', 'diff', 'HEAD', '--numstat'], { timeoutMs: GIT_TIMEOUT_MS }),
        $.process.run(['git', 'stash', 'list'], { timeoutMs: GIT_TIMEOUT_MS }),
      ])
      if (diff && diff.exitCode !== 0) throw new Error(diff.stderr.trim())
      const lines = diff ? parseNumstat(diff.stdout) : { added: 0, deleted: 0 }
      // A failing stash list (no stash ref yet in some setups) counts as none.
      const stashes = stash.exitCode === 0 ? countStashes(stash.stdout) : 0
      snap = {
        place: placeOf(cwd, repo.top),
        git: { ...parseStatus(status.stdout), ...lines, worktree: repo.worktree, stashes },
      }
    }
    lastError = null
  } catch (err) {
    report($, err)
    return
  }
  $.ui.invalidate('ui.render')
}

export const register: Register = (on, options) => {
  const thresholds = thresholdsOf(options)

  on('session.start', async ($, e, next) => {
    const out = await next(e)
    await refresh($)
    return out
  })
  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })
  // Stacks the line under whatever the engine and other plugins draw at the hint.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!snap) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        {renderLine(Text, snap, thresholds)}
      </Box>
    )
  })
}
