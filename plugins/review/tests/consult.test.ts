import { describe, expect, test } from 'claude-code/testing'
import { agyCall, agyHooksJson, agyInputText, blockedFiles, clip, codexCall, diffArgv, failure, fileListArgvs, MAX_NOTES, preamble, tail, validate, type Consult } from '../hooks/consult/consult'

const REPO = '/home/u/repo'
const ok = (over: Record<string, unknown> = {}): Consult => {
  const r = validate({ cli: 'codex', mode: 'diff', model: 'gpt-6-sol', effort: 'high', ...over })
  if ('error' in r) throw new Error(r.error)
  return r.ok
}
const err = (over: Record<string, unknown>) => {
  const r = validate({ cli: 'codex', mode: 'diff', model: 'gpt-6-sol', effort: 'high', ...over })
  return 'error' in r ? r.error : null
}

describe('validate', () => {
  test('a minimal diff call gets the default timeout', () => {
    expect(ok()).toMatchObject({ cli: 'codex', mode: 'diff', notes: '', timeoutSec: 480 })
  })

  test('missing or wrong tool, mode, model and effort are refused', () => {
    expect(err({ cli: 'gpt' })).toMatch(/cli must be/)
    expect(err({ mode: 'other' })).toMatch(/mode must be/)
    expect(err({ model: undefined })).toMatch(/model is required/)
    expect(err({ model: '--oops' })).toMatch(/model is required/)
    expect(err({ effort: undefined })).toMatch(/effort is required/)
  })

  test('codex refuses ultra; agy refuses xhigh and non-gemini models', () => {
    expect(err({ effort: 'ultra' })).toMatch(/ultra is not allowed/)
    expect(err({ cli: 'agy', model: 'gemini-3.1-pro-high', effort: 'xhigh' })).toMatch(/agy effort/)
    expect(err({ cli: 'agy', model: 'claude-sonnet-4-6', effort: 'high' })).toMatch(/gemini-\*/)
    expect(err({ cli: 'agy', model: 'gemini-3.1-pro-high', effort: 'max' })).toBeNull()
    expect(err({ effort: 'xhigh' })).toBeNull()
  })

  test('plan mode needs notes; diff mode does not', () => {
    expect(err({ mode: 'plan' })).toMatch(/needs the plan/)
    expect(err({ mode: 'plan', notes: '  \n' })).toMatch(/needs the plan/)
    expect(err({ mode: 'plan', notes: 'the plan' })).toBeNull()
  })

  test('notes are length-bounded', () => {
    expect(err({ notes: 'x'.repeat(MAX_NOTES + 1) })).toMatch(/limit is/)
    expect(err({ notes: 5 })).toMatch(/notes must be a string/)
    expect(err({ notes: 'x'.repeat(MAX_NOTES) })).toBeNull()
  })

  test('base and commit exclude each other, stay literal, and apply to diff mode only', () => {
    expect(err({ base: 'main', commit: 'HEAD' })).toMatch(/mutually exclusive/)
    for (const bad of ['-p', '--output=x', 'a b', 'a;b', '$(x)']) expect(err({ base: bad })).toMatch(/base must match/)
    expect(err({ commit: '--all' })).toMatch(/commit must match/)
    expect(err({ mode: 'plan', notes: 'p', base: 'main' })).toMatch(/diff mode only/)
    expect(err({ base: 'origin/main' })).toBeNull()
  })

  test('timeoutSec is an integer from 1 to 540', () => {
    expect(err({ timeoutSec: 541 })).toMatch(/timeoutSec/)
    expect(err({ timeoutSec: 0 })).toMatch(/timeoutSec/)
    expect(err({ timeoutSec: '60' })).toMatch(/timeoutSec/)
    expect(ok({ timeoutSec: 540 }).timeoutSec).toBe(540)
  })

  test('repo must be a non-empty string', () => {
    expect(err({ repo: '' })).toMatch(/repo must be/)
    expect(err({ repo: 3 })).toMatch(/repo must be/)
  })
})

describe('blockedFiles', () => {
  test('secret-like names are blocked, examples and ordinary files are not', () => {
    const names = ['a.py', '.env', 'cfg/.env.local', 'server.pem', 'id_rsa', 'keys/id_ed25519.pub', 'db/credentials.json', 'my_secret.txt', '.env.example', 'x/.env.sample']
    expect(blockedFiles(names.join('\n'))).toEqual(['.env', 'cfg/.env.local', 'server.pem', 'id_rsa', 'keys/id_ed25519.pub', 'db/credentials.json', 'my_secret.txt'])
  })

  test('a path too long to scan is blocked unread', () => {
    expect(blockedFiles('a/' + 'x'.repeat(5000))).toHaveLength(1)
  })
})

describe('argv building', () => {
  test('codex diff mode runs in the repo, read-only, prompt on stdin, under timeout', () => {
    const c = ok({ notes: 'Focus: auth', timeoutSec: 100 })
    const call = codexCall(c, REPO)
    expect(call.argv.slice(0, 5)).toEqual(['timeout', '-k', '5', '100', 'codex'])
    expect(call.argv).toEqual(expect.arrayContaining(['exec', 'review', '-', 'sandbox_mode="read-only"', '-m', 'gpt-6-sol', 'model_reasoning_effort="high"', '--ephemeral']))
    expect(call.cwd).toBe(REPO)
    expect(call.stdin).toContain('uncommitted changes')
    expect(call.stdin).toMatch(/--- Notes from the requester ---\nFocus: auth$/)
  })

  test('codex plan mode reads stdin, read-only, with the repo as -C', () => {
    const call = codexCall(ok({ mode: 'plan', notes: 'plan text' }), REPO)
    expect(call.argv).toEqual(expect.arrayContaining(['exec', '-', '-s', 'read-only', '--skip-git-repo-check', '-C', REPO]))
    expect(call.argv).not.toContain('review')
    expect(call.cwd).toBeUndefined()
    expect(call.stdin).toContain('adversarial reviewer')
    expect(call.stdin).toContain('plan text')
  })

  test('agy runs in the workspace with the repo added, under timeout', () => {
    const c = ok({ cli: 'agy', model: 'gemini-3.1-pro-high', effort: 'high', timeoutSec: 60 })
    const call = agyCall(c, REPO, '/tmp/ws')
    expect(call.cwd).toBe('/tmp/ws')
    expect(call.argv.slice(0, 5)).toEqual(['timeout', '-k', '5', '60', 'agy'])
    expect(call.argv).toEqual(expect.arrayContaining(['--add-dir', REPO, '--model', 'gemini-3.1-pro-high', '--effort', 'high', '-p']))
    expect(call.argv.at(-1)).toContain('/tmp/ws/review-input.md')
  })

  test('agy hook config points at the gate and matches every tool', () => {
    const cfg = JSON.parse(agyHooksJson('/p/agy-gate.sh'))
    expect(cfg['second-opinion-readonly'].PreToolUse[0]).toMatchObject({ matcher: '*', hooks: [{ type: 'command', command: '/p/agy-gate.sh' }] })
  })

  test('agy input holds the notes and the diff', () => {
    const text = agyInputText(ok({ cli: 'agy', model: 'gemini-3.1-pro-high', notes: 'focus' }), '+x = 2')
    expect(text).toContain('focus')
    expect(text).toContain('--- Diff under review ---\n+x = 2')
    expect(agyInputText(ok({ mode: 'plan', notes: 'p' }), '')).not.toContain('Diff under review')
  })

  test('diff targets: default, base, commit', () => {
    expect(fileListArgvs(ok(), REPO)).toHaveLength(2)
    expect(fileListArgvs(ok({ base: 'main' }), REPO)[0]).toContain('main...HEAD')
    expect(fileListArgvs(ok({ commit: 'abc123' }), REPO)[0]).toEqual(expect.arrayContaining(['show', '--name-only', 'abc123']))
    expect(diffArgv(ok(), REPO)).toEqual(expect.arrayContaining(['diff', '--no-ext-diff', '--no-textconv', 'HEAD']))
    expect(diffArgv(ok({ commit: 'abc123' }), REPO)).toEqual(expect.arrayContaining(['show', 'abc123']))
    expect(diffArgv(ok(), REPO)).toContain('core.fsmonitor=false')
  })

  test('preamble names the target and the repo', () => {
    expect(preamble(ok({ base: 'main' }), REPO)).toContain('git diff main...HEAD')
    expect(preamble(ok({ commit: 'abc123' }), REPO)).toContain('commit abc123')
    expect(preamble(ok(), REPO)).toContain(REPO)
  })
})

describe('output', () => {
  test('clip cuts long text with a note', () => {
    expect(clip('ok', 10, 'reply')).toBe('ok')
    expect(clip('x'.repeat(20), 10, 'reply')).toMatch(/\[reply truncated at 10 characters\]$/)
  })

  test('tail keeps the last lines within the character bound', () => {
    const log = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n')
    expect(tail(log).split('\n')).toHaveLength(20)
    expect(tail(log).endsWith('line 49')).toBe(true)
    expect(tail('y'.repeat(10_000)).length).toBe(4000)
  })

  test('a timeout and a failure say so, with the log tail', () => {
    const c = ok({ timeoutSec: 60 })
    expect(failure(c, 124, '', 'stuck')).toMatch(/timed out.*60s.*Split.*\nstuck$/s)
    expect(failure(c, 137, '', '')).toMatch(/timed out/)
    expect(failure(c, 2, '', 'bad flag')).toMatch(/exited 2\.\nbad flag$/)
    expect(failure(c, 0, '', '')).toMatch(/empty reply/)
  })
})

describe('consult tool', () => {
  const calls: any[] = []
  async function start($: any, on: any, run: (argv: string[], e: any) => { exitCode: number; stdout?: string; stderr?: string }) {
    calls.length = 0
    on('session.cwd', async () => ({ value: REPO }))
    on('session.start', async () => ({ cwd: REPO }))
    on('process.run', async (_$: any, e: any) => {
      calls.push(e)
      const r = run(e.argv, e)
      return { value: { stdout: '', stderr: '', ...r } }
    })
    await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true })
  }
  const base = { tool: 'mcp__review__consult', cli: 'codex', model: 'gpt-6-sol', effort: 'high', mode: 'diff' }
  const happy = (argv: string[]) => {
    if (argv[0] === 'sh') return { exitCode: 0, stdout: REPO + '\n' }
    if (argv.includes('rev-parse')) return { exitCode: 0, stdout: '.git\n' }
    if (argv.includes('--name-only') || argv.includes('ls-files')) return { exitCode: 0, stdout: 'a.py\n' }
    return { exitCode: 0, stdout: 'No significant findings.\n' }
  }

  test('a diff call returns the header and the reply, and runs codex once', async ($, on) => {
    await start($, on, happy)
    const out: any = await $.tool.call({ ...base, notes: 'focus' })
    expect(out.result).toMatch(/^second-opinion: codex gpt-6-sol\/high mode=diff repo=\/home\/u\/repo\nNo significant findings\.$/)
    const codex = calls.filter(c => c.argv.includes('codex'))
    expect(codex).toHaveLength(1)
    expect(codex[0].init.stdin).toContain('focus')
    expect(codex[0].init.timeoutMs).toBe((480 + 5 + 10) * 1000)
  })

  test('invalid input is refused and nothing runs', async ($, on) => {
    await start($, on, happy)
    const out: any = await $.tool.call({ ...base, effort: 'ultra' })
    expect(out.deny).toMatch(/ultra is not allowed/)
    expect(calls).toHaveLength(0)
  })

  test('the opt-out marker stops the call before any model runs', async ($, on) => {
    await start($, on, argv => (argv[0] === 'sh' ? { exitCode: 3, stderr: 'external review disabled for this repo (x)' } : happy(argv)))
    const out: any = await $.tool.call(base)
    expect(out.deny).toMatch(/external review disabled/)
    expect(calls.filter(c => c.argv.includes('codex'))).toHaveLength(0)
  })

  test('a secret-like file in the diff blocks the send', async ($, on) => {
    await start($, on, argv => (argv.includes('--name-only') ? { exitCode: 0, stdout: 'a.py\n.env\n' } : happy(argv)))
    const out: any = await $.tool.call(base)
    expect(out.deny).toMatch(/secret-like files.*\.env/)
    expect(calls.filter(c => c.argv.includes('codex'))).toHaveLength(0)
  })

  test('diff mode outside git is an error', async ($, on) => {
    await start($, on, argv => (argv.includes('rev-parse') ? { exitCode: 128 } : happy(argv)))
    expect(((await $.tool.call(base)) as any).deny).toMatch(/needs a git repo/)
  })

  test('an empty diff is an error', async ($, on) => {
    await start($, on, argv => (argv.includes('--name-only') || argv.includes('ls-files') ? { exitCode: 0, stdout: '' } : happy(argv)))
    expect(((await $.tool.call(base)) as any).deny).toMatch(/no changes found/)
  })

  test('exit 124 is a timeout error with the log tail', async ($, on) => {
    await start($, on, argv => (argv.includes('codex') ? { exitCode: 124, stderr: 'still thinking' } : happy(argv)))
    const out: any = await $.tool.call({ ...base, timeoutSec: 30 })
    expect(out.deny).toMatch(/timed out.*30s.*Split the review/s)
    expect(out.deny).toContain('still thinking')
  })

  test('a failing CLI is an error with its log', async ($, on) => {
    await start($, on, argv => (argv.includes('codex') ? { exitCode: 1, stderr: 'auth failed' } : happy(argv)))
    expect(((await $.tool.call(base)) as any).deny).toMatch(/exited 1\.\nauth failed/)
  })

  test('an empty reply is an error, never an empty success', async ($, on) => {
    await start($, on, argv => (argv.includes('codex') ? { exitCode: 0, stdout: '  \n' } : happy(argv)))
    expect(((await $.tool.call(base)) as any).deny).toMatch(/empty reply/)
  })

  test('a long reply is clipped', async ($, on) => {
    await start($, on, argv => (argv.includes('codex') ? { exitCode: 0, stdout: 'x'.repeat(70_000) } : happy(argv)))
    const out: any = await $.tool.call(base)
    expect(out.result.length).toBeLessThan(61_000)
    expect(out.result).toMatch(/\[reply truncated/)
  })

  test('agy writes its workspace, runs in it, and removes it', async ($, on) => {
    await start($, on, argv => {
      if (argv[0] === 'mktemp') return { exitCode: 0, stdout: '/tmp/second-opinion.AbC123\n' }
      if (argv.includes('diff')) return { exitCode: 0, stdout: '+x = 2\n' }
      if (argv.includes('agy')) return { exitCode: 0, stdout: 'finding\n' }
      return happy(argv)
    })
    const out: any = await $.tool.call({ ...base, cli: 'agy', model: 'gemini-3.1-pro-high', notes: 'n' })
    expect(out.result).toMatch(/^second-opinion: agy gemini-3.1-pro-high\/high.*\nfinding$/s)
    const writes = calls.filter(c => c.argv[0] === 'sh' && c.argv[2].includes('cat >'))
    expect(writes.map(c => c.argv[4])).toEqual(['/tmp/second-opinion.AbC123/.agents/hooks.json', '/tmp/second-opinion.AbC123/review-input.md'])
    expect(writes[1].init.stdin).toContain('+x = 2')
    expect(calls.find(c => c.argv.includes("agy")).init.cwd).toBe('/tmp/second-opinion.AbC123')
    expect(calls.at(-1).argv).toEqual(['rm', '-rf', '/tmp/second-opinion.AbC123'])
  })

  test('agy cleans up its workspace when the review fails', async ($, on) => {
    await start($, on, argv => {
      if (argv[0] === 'mktemp') return { exitCode: 0, stdout: '/tmp/second-opinion.AbC123\n' }
      if (argv.includes('agy')) return { exitCode: 124, stderr: 'slow' }
      return happy(argv)
    })
    const out: any = await $.tool.call({ ...base, cli: 'agy', model: 'gemini-3.1-pro-high' })
    expect(out.deny).toMatch(/timed out/)
    expect(calls.at(-1).argv).toEqual(['rm', '-rf', '/tmp/second-opinion.AbC123'])
  })
})

