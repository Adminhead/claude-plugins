import type { Register } from 'claude-code'
import { parseNumstat, parseStatus, placeOf, renderLine, type Snapshot } from './line'

let snap: Snapshot | null = null
let lastError: string | null = null

async function refresh($: any) {
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
    lastError = null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message !== lastError) $.ui.log(`git-line: ${message}`)
    lastError = message
    return
  }
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)
    return next(e)
  })
  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!snap) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        {renderLine(Text, snap)}
      </Box>
    )
  })
}
