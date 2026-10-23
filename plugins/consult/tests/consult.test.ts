import { describe, expect, mock, test } from 'claude-code/testing'
import { clientErrorText, fitLine, KINDS, type ClientResult } from '../hooks/consult/appserver'
import {
  agyCall, agyHooksJson, agyInputText, blockedFiles, clientArgv, CLIENT_SLACK_SEC, clip, codexRequest, diffArgv, failure, fileListArgvs, header,
  lockPolicyOption, MAX_NOTES, preamble, socketOption, tail, validate, type Consult,
} from '../hooks/consult/consult'
import { checkClientRequest } from '../hooks/consult/appserver'

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
const AGY = { cli: 'agy', model: 'gemini-4-argon-high', effort: 'high' }

describe('validate', () => {
  test('a minimal diff call gets the default timeout', () => {
    expect(ok()).toMatchObject({ cli: 'codex', mode: 'diff', notes: '', timeoutSec: 480 })
  })

  test('cli defaults to codex, where model and effort are optional', () => {
    const r = validate({ mode: 'diff' })
    expect(r).toEqual({ ok: { cli: 'codex', mode: 'diff', notes: '', repo: undefined, base: undefined, commit: undefined, timeoutSec: 480 } })
    expect(err({ model: undefined, effort: undefined })).toBeNull()
    expect(err({ cli: 'codex', model: 'gpt-6-sol', effort: undefined })).toBeNull()
  })

  test('wrong tool, mode, model and effort are refused; agy still needs model and effort', () => {
    expect(err({ cli: 'gpt' })).toMatch(/cli must be/)
    expect(err({ mode: 'other' })).toMatch(/mode must be/)
    expect(err({ model: '--oops' })).toMatch(/model must look like a model id/)
    expect(err({ model: 5 })).toMatch(/model must look like/)
    expect(err({ ...AGY, model: undefined })).toMatch(/model is required for agy/)
    expect(err({ ...AGY, effort: undefined })).toMatch(/effort is required for agy/)
  })

  test('codex refuses ultra; agy refuses ultra and non-gemini models', () => {
    expect(err({ effort: 'ultra' })).toMatch(/ultra is not allowed/)
    expect(err({ ...AGY, effort: 'ultra' })).toMatch(/agy effort/)
    expect(err({ ...AGY, effort: 'xhigh' })).toBeNull()
    expect(err({ ...AGY, model: 'claude-sonnet-4-6' })).toMatch(/gemini-\*/)
    expect(err({ ...AGY, effort: 'max' })).toBeNull()
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
    expect(err({ repo: '/a\nb' })).toMatch(/newline/)
    expect(err({ repo: '/a\rb' })).toMatch(/newline/)
    expect(err({ repo: '' })).toMatch(/repo must be/)
    expect(err({ repo: 3 })).toMatch(/repo must be/)
  })

  test('the codexSocket option is unset, or a path checkSocketPath accepts', () => {
    expect(socketOption(undefined)).toEqual({})
    expect(socketOption('')).toEqual({})
    expect(socketOption('/run/user/1000/codex-consult.sock')).toEqual({ socket: '/run/user/1000/codex-consult.sock' })
    for (const bad of ['/tmp/a b.sock', '/tmp/x?y.sock', '/tmp/a#b.sock', 'rel.sock', '/a/../b.sock', 7]) expect((socketOption(bad) as any).error).toMatch(/codexSocket option is invalid/)
  })

  test('the codexLockPolicy option is unset, thread or strict', () => {
    expect(lockPolicyOption(undefined)).toEqual({})
    expect(lockPolicyOption('')).toEqual({})
    expect(lockPolicyOption('thread')).toEqual({ policy: 'thread' })
    expect(lockPolicyOption('strict')).toEqual({ policy: 'strict' })
    for (const bad of ['off', 'Strict', ' strict', 1, null, {}]) {
      expect((lockPolicyOption(bad) as any).error, JSON.stringify(bad)).toMatch(/^the consult codexLockPolicy option must be empty, "thread" or "strict", not .* \(set it in \/config\)$/)
    }
    expect((lockPolicyOption('x'.repeat(5000)) as any).error.length).toBeLessThan(200)
  })
})

describe('blockedFiles', () => {
  test('secret-like names are blocked, examples and ordinary files are not', () => {
    const names = ['a.py', '.env', 'cfg/.env.local', 'clé.pem', 'dé/.env', 'we"ird.pem', 'server.pem', 'id_rsa', 'keys/id_ed25519.pub', 'db/credentials.json', 'my_secret.txt', '.env.example', 'x/.env.sample']
    expect(blockedFiles(names.join('\0'))).toEqual(['.env', 'cfg/.env.local', 'clé.pem', 'dé/.env', 'we"ird.pem', 'server.pem', 'id_rsa', 'keys/id_ed25519.pub', 'db/credentials.json', 'my_secret.txt'])
  })

  test('a path too long to scan is blocked unread', () => {
    expect(blockedFiles('a/' + 'x'.repeat(5000))).toHaveLength(1)
  })
})

describe('argv building', () => {
  test('the codex request carries the diff prompt with the notes, for the repo', () => {
    const req = codexRequest(ok({ notes: 'Focus: auth', timeoutSec: 100 }), REPO)
    expect(req).toMatchObject({ mode: 'diff', cwd: REPO, model: 'gpt-6-sol', effort: 'high', timeoutSec: 100 })
    expect(req.prompt).toContain('uncommitted changes')
    expect(req.prompt).toMatch(/--- Notes from the requester ---\nFocus: auth$/)
  })

  test('the codex request leaves out model, effort and socket unless given', () => {
    const req = codexRequest(ok({ model: undefined, effort: undefined }), REPO)
    expect(Object.keys(req).sort()).toEqual(['cwd', 'mode', 'prompt', 'timeoutSec'])
    expect(codexRequest(ok(), REPO, '/tmp/s.sock').socket).toBe('/tmp/s.sock')
  })

  test('the codex request carries the lock policy only when set, and the client accepts it', () => {
    expect(codexRequest(ok(), REPO).policy).toBeUndefined()
    for (const policy of ['thread', 'strict'] as const) {
      const req = codexRequest(ok(), REPO, undefined, policy)
      expect(req.policy).toBe(policy)
      expect(checkClientRequest(JSON.parse(JSON.stringify(req)))).toEqual({ ok: req })
    }
  })

  test('the codex client argv runs bun without env file or config', () => {
    expect(clientArgv('/p')).toEqual(['bun', '--no-env-file', '--config=/dev/null', '/p/scripts/codex-app-server.ts'])
    expect(CLIENT_SLACK_SEC).toBe(19)
  })

  test('agy runs in the workspace without the repo, under timeout', () => {
    const c = ok({ ...AGY, timeoutSec: 60 })
    const call = agyCall(c, REPO, '/tmp/ws')
    expect(call.cwd).toBe('/tmp/ws')
    expect(call.argv.slice(0, 5)).toEqual(['timeout', '-k', '5', '60', 'agy'])
    expect(call.argv).toEqual(expect.arrayContaining(['--model', 'gemini-4-argon-high', '--effort', 'high', '-p']))
    expect(call.argv.at(-1)).toContain('/tmp/ws/review-input.md')
  })

  test('agy plan prompts do not offer repo files it cannot see; codex plan prompts do', () => {
    const plan = { mode: 'plan', notes: 'p' }
    expect(agyCall(ok({ ...AGY, ...plan }), REPO, '/tmp/ws').argv.at(-1)).not.toContain('may read files')
    const req = codexRequest(ok(plan), REPO)
    expect(req.prompt).toContain(`You may read files in ${REPO}`)
    expect(req.prompt).toContain('adversarial reviewer')
  })

  test('agy hook config points at the gate and matches every tool', () => {
    const cfg = JSON.parse(agyHooksJson('/p/agy-gate.sh'))
    expect(cfg['second-opinion-readonly'].PreToolUse[0]).toMatchObject({ matcher: '*', hooks: [{ type: 'command', command: '/p/agy-gate.sh' }] })
  })

  test('agy input holds the notes and the diff', () => {
    const text = agyInputText(ok({ ...AGY, notes: 'focus' }), '+x = 2')
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

  test('an agy timeout and failure say so, with the log tail', () => {
    const c = ok({ ...AGY, timeoutSec: 60 })
    expect(failure(c, 124, '', 'stuck')).toMatch(/timed out.*60s.*Split.*\nstuck$/s)
    expect(failure(c, 137, '', '')).toMatch(/timed out/)
    expect(failure(c, 2, '', 'bad flag')).toMatch(/exited 2\.\nbad flag$/)
    expect(failure(c, 0, '', '')).toMatch(/empty reply/)
  })

  test('the header labels where the codex model came from', () => {
    expect(header(ok(), REPO, { model: 'gpt-6-sol', effort: 'high', modelSource: 'observed' })).toBe(`second-opinion: codex gpt-6-sol/high (observed) mode=diff repo=${REPO}`)
    expect(header(ok({ model: undefined, effort: undefined }), REPO, { model: null, effort: null, modelSource: 'config' })).toBe(`second-opinion: codex default/default (config) mode=diff repo=${REPO}`)
    expect(header(ok(AGY), REPO)).toBe(`second-opinion: agy gemini-4-argon-high/high mode=diff repo=${REPO}`)
  })
})

const ITEMS = { commandExecution: { completed: 1, failed: 0, declined: 0 }, fileChange: { completed: 0, failed: 0, declined: 0 } }
const clientOk = (over: Record<string, unknown> = {}): ClientResult => ({
  ok: true, reply: 'No significant findings.\n', model: 'gpt-6-sol', effort: 'high', modelSource: 'requested', provider: 'openai', version: '0.162.1', durationMs: 9, notices: [], items: ITEMS, ...over,
} as ClientResult)
const line = (r: ClientResult) => fitLine(r) + '\n'

describe('consult tool', () => {
  const calls: any[] = []
  type Run = (argv: string[], e: any) => { exitCode: number; stdout?: string; stderr?: string } | Promise<{ exitCode: number; stdout?: string; stderr?: string }>
  async function start($: any, on: any, run: Run, decision: string | Error = 'allow') {
    calls.length = 0
    const clock = mock.clock(on, { now: 1_000_000 })
    // The verdict for consult itself; $.ui.ask's own AskUserQuestion call is checked through the same event.
    on('tool.check', async (_$: any, e: any) => {
      if (e?.tool === 'AskUserQuestion') return { decision: 'allow' }
      if (decision instanceof Error) throw decision
      return { decision }
    })
    on('session.cwd', async () => ({ value: REPO }))
    on('session.start', async () => ({ cwd: REPO }))
    on('process.run', async (_$: any, e: any) => {
      calls.push(e)
      const r = await run(e.argv, e)
      return { value: { stdout: '', stderr: '', ...r } }
    })
    await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true })
    return clock
  }
  const base = { tool: 'mcp__consult__consult', cli: 'codex', model: 'gpt-6-sol', effort: 'high', mode: 'diff' }
  const isClient = (argv: string[]) => argv[0] === 'bun'
  const happy = (argv: string[]) => {
    if (argv[0] === 'sh') return { exitCode: 0, stdout: REPO + '\n' + REPO + '\n' }
    if (argv.includes('--name-only') || argv.includes('ls-files')) return { exitCode: 0, stdout: 'a.py\0' }
    if (isClient(argv)) return { exitCode: 0, stdout: line(clientOk()) }
    return { exitCode: 0, stdout: 'No significant findings.\n' }
  }
  const withClient = (r: { exitCode: number; stdout?: string; stderr?: string } | ((e: any) => any)) => (argv: string[], e: any) => (isClient(argv) ? (typeof r === 'function' ? r(e) : r) : happy(argv))

  test('a diff call returns the header and the reply, and runs the codex client once', async ($, on) => {
    await start($, on, happy)
    const out: any = await $.tool.call({ ...base, notes: 'focus' })
    expect(out.result).toMatch(/^second-opinion: codex gpt-6-sol\/high \(requested\) mode=diff repo=\/home\/u\/repo\nNo significant findings\.$/)
    const client = calls.filter(c => isClient(c.argv))
    expect(client).toHaveLength(1)
    expect(JSON.parse(client[0].init.stdin)).toMatchObject({ mode: 'diff', cwd: REPO, model: 'gpt-6-sol', effort: 'high', timeoutSec: 480 })
    expect(JSON.parse(client[0].init.stdin).prompt).toContain('focus')
    expect(client[0].init.timeoutMs).toBe((480 + 2 + 5 + 2 + 10) * 1000)
  })

  test('without cli the client runs once with the exact argv, cwd = plugin root, and no model, effort or socket', async ($, on) => {
    await start($, on, happy)
    const out: any = await $.tool.call({ tool: 'mcp__consult__consult', mode: 'plan', notes: 'Plan: add 1+1.', timeoutSec: 60 })
    expect(out.result).toMatch(/^second-opinion: codex gpt-6-sol\/high \(requested\) mode=plan/)
    const client = calls.filter(c => isClient(c.argv))
    expect(client).toHaveLength(1)
    const root = client[0].init.cwd
    expect(root).toMatch(/^\//)
    expect(root).not.toBe(REPO)
    expect(client[0].argv).toEqual(['bun', '--no-env-file', '--config=/dev/null', `${root}/scripts/codex-app-server.ts`])
    const stdin = JSON.parse(client[0].init.stdin)
    expect(Object.keys(stdin).sort()).toEqual(['cwd', 'mode', 'prompt', 'timeoutSec'])
    expect(client[0].init.timeoutMs).toBe((60 + 19) * 1000)
    expect(calls.some(c => c.argv.includes('codex') || c.argv.includes('timeout'))).toBe(false)
  })

  test('the header shows an observed model and the notices', async ($, on) => {
    await start($, on, withClient({ exitCode: 0, stdout: line(clientOk({ model: 'gpt-6-mini', effort: 'low', modelSource: 'observed', notices: ['AGENTS.md loaded: /r/AGENTS.md'], reply: 'finding' })) }))
    const out: any = await $.tool.call(base)
    expect(out.result).toBe(`second-opinion: codex gpt-6-mini/low (observed) mode=diff repo=${REPO}\nnote: AGENTS.md loaded: /r/AGENTS.md\nfinding`)
  })

  test('every client failure kind maps to its text; timeout says to split the review', async ($, on) => {
    let kind = 'input'
    await start($, on, withClient(() => ({ exitCode: 0, stdout: line({ ok: false, kind, message: `msg-${kind}`, log: 'log tail' } as ClientResult) })))
    for (const k of KINDS) {
      kind = k
      const out: any = await $.tool.call(base)
      expect(out.deny).toBe(clientErrorText({ ok: false, kind: k, message: `msg-${k}`, log: 'log tail' }))
      expect(out.deny).toContain(`msg-${k}`)
    }
    kind = 'timeout'
    expect(((await $.tool.call(base)) as any).deny).toMatch(/timed out.*Split the review/s)
  })

  test('a cut line gives the cut-output error; garbage and a non-zero exit are crashes', async ($, on) => {
    let r: any = { exitCode: 0, stdout: line(clientOk({ reply: 'x'.repeat(100) })).slice(0, 40) }
    await start($, on, withClient(() => r))
    expect(((await $.tool.call(base)) as any).deny).toMatch(/output was cut; the reply was too long/)
    r = { exitCode: 0, stdout: 'garbage', stderr: 'bun: boom' }
    expect(((await $.tool.call(base)) as any).deny).toMatch(/crashed.*\n[\s\S]*bun: boom/)
    r = { exitCode: 1, stdout: '', stderr: 'TypeError: x' }
    expect(((await $.tool.call(base)) as any).deny).toMatch(/crashed \(exit 1\)\.\nTypeError: x/)
  })

  test('a long reply is clipped; an empty ok reply is an error', async ($, on) => {
    let reply = 'x'.repeat(70_000)
    await start($, on, withClient(() => ({ exitCode: 0, stdout: JSON.stringify(clientOk({ reply })) })))
    const out: any = await $.tool.call(base)
    expect(out.result.length).toBeLessThan(61_000)
    expect(out.result).toMatch(/\[reply truncated/)
    reply = '  \n'
    expect(((await $.tool.call(base)) as any).deny).toMatch(/empty reply/)
  })

  test('a backstop rejection and a spawn rejection give different messages', async ($, on) => {
    let advance = 0
    const clock = await start($, on, async (argv: string[]) => {
      if (!isClient(argv)) return happy(argv)
      if (advance > 0) await clock.advance(advance)
      throw new Error('still running at the timeout')
    })
    advance = (30 + 19) * 1000
    const late: any = await $.tool.call({ ...base, timeoutSec: 30 })
    expect(late.deny).toMatch(/^consult timed out: the codex client did not exit within 49s \(backstop\)/)
    // A throwing test hook is skipped, so the run falls to the kit's bottom hook, which rejects at once.
    advance = 0
    const early: any = await $.tool.call({ ...base, timeoutSec: 30 })
    expect(early.deny).toMatch(/^consult: could not run the codex client \(bun on PATH\?\): .+/)
    expect(early.deny).not.toMatch(/backstop/)
  })

  test('the engine permission verdict gates the call: deny and an unanswerable ask run nothing', async ($, on) => {
    await start($, on, happy, 'deny')
    expect(((await $.tool.call(base)) as any).deny).toMatch(/not permitted/)
    expect(calls).toHaveLength(0)
  })

  test('an ask with nobody to ask is refused', async ($, on) => {
    await start($, on, happy, 'ask')
    const out: any = await $.tool.call(base)
    expect(out.deny).toMatch(/^consult: needs approval and nobody can be asked here/)
    expect(calls).toHaveLength(0)
  })

  test('a thrown permission check is refused with its reason', async ($, on) => {
    await start($, on, happy, new Error('engine down'))
    const out: any = await $.tool.call(base)
    expect(out.deny).toMatch(/^consult: permission check failed: /)
    expect(calls).toHaveLength(0)
  })

  test('an ask the person answers Allow runs the review', async ($, on) => {
    on('tool.call', async (_$: any, e: any, next: any) => (e.tool === 'AskUserQuestion' ? { result: { answers: { 'Send code to an outside model (codex diff review of the session repo)?': 'Allow' } } } : next(e)))
    await start($, on, happy, 'ask')
    const out: any = await $.tool.call(base)
    expect(out.result).toMatch(/^second-opinion: codex/)
  })

  test('other tools pass through untouched', async ($, on) => {
    on('tool.call', async (_$: any, e: any, next: any) => (e.tool === 'Read' ? { result: 'file text' } : next(e)))
    await start($, on, happy)
    expect(((await $.tool.call({ tool: 'Read', file_path: '/x' } as any)) as any).result).toBe('file text')
    expect(calls).toHaveLength(0)
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
    expect(calls.filter(c => isClient(c.argv))).toHaveLength(0)
  })

  test('a secret-like file in the diff blocks the send', async ($, on) => {
    await start($, on, argv => (argv.includes('--name-only') ? { exitCode: 0, stdout: 'a.py\0.env\0' } : happy(argv)))
    const out: any = await $.tool.call(base)
    expect(out.deny).toMatch(/secret-like files.*\.env/)
    expect(calls.filter(c => isClient(c.argv))).toHaveLength(0)
  })

  test('diff mode outside git is an error', async ($, on) => {
    await start($, on, argv => (argv[0] === 'sh' && argv[2].includes('--git-common-dir') ? { exitCode: 0, stdout: REPO + '\n\n' } : happy(argv)))
    expect(((await $.tool.call(base)) as any).deny).toMatch(/needs a git repo/)
  })

  test('an empty diff is an error', async ($, on) => {
    await start($, on, argv => (argv.includes('--name-only') || argv.includes('ls-files') ? { exitCode: 0, stdout: '' } : happy(argv)))
    expect(((await $.tool.call(base)) as any).deny).toMatch(/no changes found/)
  })

  test('agy writes its workspace, runs in it, and removes it', async ($, on) => {
    await start($, on, argv => {
      if (argv[0] === 'mktemp') return { exitCode: 0, stdout: '/tmp/second-opinion.AbC123\n' }
      if (argv.includes('diff')) return { exitCode: 0, stdout: '+x = 2\n' }
      if (argv.includes('agy')) return { exitCode: 0, stdout: 'finding\n' }
      return happy(argv)
    })
    const out: any = await $.tool.call({ ...base, ...AGY, notes: 'n' })
    expect(out.result).toMatch(/^second-opinion: agy gemini-4-argon-high\/high.*\nfinding$/s)
    const writes = calls.filter(c => c.argv[0] === 'sh' && c.argv[2].includes('cat >'))
    expect(writes.map(c => c.argv[4])).toEqual(['/tmp/second-opinion.AbC123/.agents/hooks.json', '/tmp/second-opinion.AbC123/review-input.md'])
    expect(JSON.parse(writes[0].init.stdin)['second-opinion-readonly'].PreToolUse[0].hooks[0].command).toMatch(/\/scripts\/agy-gate\.sh$/)
    expect(writes[1].init.stdin).toContain('+x = 2')
    expect(calls.find(c => c.argv.includes('agy')).init.cwd).toBe('/tmp/second-opinion.AbC123')
    expect(calls.at(-1).argv).toEqual(['rm', '-rf', '/tmp/second-opinion.AbC123'])
    expect(calls.filter(c => isClient(c.argv))).toHaveLength(0)
  })

  test('agy cleans up its workspace when the review fails, and exit 124 is a timeout', async ($, on) => {
    await start($, on, argv => {
      if (argv[0] === 'mktemp') return { exitCode: 0, stdout: '/tmp/second-opinion.AbC123\n' }
      if (argv.includes('agy')) return { exitCode: 124, stderr: 'slow' }
      return happy(argv)
    })
    const out: any = await $.tool.call({ ...base, ...AGY })
    expect(out.deny).toMatch(/timed out.*Split the review/s)
    expect(out.deny).toContain('slow')
    expect(calls.at(-1).argv).toEqual(['rm', '-rf', '/tmp/second-opinion.AbC123'])
  })

  // The test kit cannot set the plugin's options (no config.set, and register gets the manifest defaults), so the
  // codexSocket path is covered by socketOption above and codexRequest's socket field; here, the default.
  test('the default codexSocket option passes no socket, so the client resolves $XDG_RUNTIME_DIR', async ($, on) => {
    await start($, on, happy)
    await $.tool.call(base)
    expect(JSON.parse(calls.find(c => isClient(c.argv)).init.stdin).socket).toBeUndefined()
  })
})
