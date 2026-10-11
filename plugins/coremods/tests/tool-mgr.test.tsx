import { describe, expect, test } from 'claude-code/testing'
import { cap, parseCommand } from '../hooks/tool-mgr/metrics'
import { buildRecord, classify, logPath, safeName, summarize } from '../hooks/tool-mgr/rules'

const rule = (c: string) => classify(c)?.rule ?? null

describe('classify', () => {
  test('sed that reads a file is blocked', () => {
    for (const c of ["sed -n '1,20p' f", "sed 's/a/b/' f", "cd x && sed -n 5p f", "cat f; sed -e 's/a/b/' g"]) expect(rule(c)).toBe('sed-read')
  })

  test('sed in place, sed fed by a pipe, and other commands pass', () => {
    for (const c of ["sed -i 's/a/b/' f", "sed -i.bak 's/a/b/' f", "sed --in-place 's/a/b/' f", "sed -ni 's/a/b/p' f", "git log | sed 's/a/b/'", 'ls', 'echo sed']) {
      expect(rule(c)).toBeNull()
    }
  })

  test('separators and redirects inside quotes are not shell', () => {
    for (const c of ['echo "a; sed -n 1p x"', 'grep "a>b" <<EOF\nx\nEOF', "echo 'a -> b' ; cat <<EOF\nx\nEOF", 'git commit -m "$(cat <<\'EOF\'\nx > y\nEOF\n)"']) {
      expect(rule(c)).toBeNull()
    }
    expect(rule('cat <<EOF > "out file"\nx\nEOF')).toBe('heredoc-write')
  })

  test('a quoted << is not a heredoc', () => {
    expect(rule('echo "a << b" > output.txt')).toBeNull()
    expect(rule("echo 'a << b' > output.txt")).toBeNull()
    expect(rule('cat > f <<EOF\nx\nEOF')).toBe('heredoc-write')
  })

  test('sed after || is not fed by a pipe', () => {
    expect(rule("false || sed -n 1p f")).toBe('sed-read')
  })

  test('heredoc writes are blocked', () => {
    for (const c of [
      'cat > f <<EOF\nhi\nEOF',
      "cat <<'EOF' >> f\nhi\nEOF",
      'cat <<EOF | tee out.txt\nhi\nEOF',
      "python3 - <<'EOF' > scratch\nprint(1)\nEOF",
      "python3 - <<'EOF'\nopen('a.txt', 'w').write('x')\nEOF",
      "python3 - <<'EOF'\nfrom pathlib import Path\nPath('a').write_text('x')\nEOF",
      "node <<'EOF'\nrequire('fs').writeFileSync('a', 'x')\nEOF",
      "bun <<EOF\nawait Bun.write('a','x'); appendFile('a','b')\nEOF",
    ]) {
      expect(rule(c)).toBe('heredoc-write')
    }
  })

  test('heredocs that do not write files pass', () => {
    for (const c of [
      'cat <<EOF\nhi\nEOF',
      'git commit -F - <<EOF\nmsg > quoted\nEOF',
      "python3 - <<'EOF'\nprint(1)\nEOF",
      "python3 - <<'EOF'\nprint(open('a').read())\nEOF",
      'cat <<EOF 2>&1\nhi\nEOF',
      'cat <<EOF > /dev/null\nhi\nEOF',
      'cat <<<"here string" > f',
      'echo hi > f',
      "python -c 'open(\"a\",\"w\")'",
    ]) {
      expect(rule(c)).toBeNull()
    }
  })

  test('a sed line inside a heredoc body is not a sed read', () => {
    expect(rule('git commit -F - <<EOF\nsed -n 1p f\nEOF')).toBeNull()
  })

  test('messages start with tool-mgr: and name the built-in tool', () => {
    expect(classify("sed -n 1p f")?.message).toMatch(/^tool-mgr: .*Read/)
    expect(classify('cat > f <<EOF\nx\nEOF')?.message).toMatch(/^tool-mgr: .*Write.*Edit/)
  })
})

describe('records and paths', () => {
  test('safeName keeps path components safe', () => {
    expect(safeName('../x', 'f')).toBe('___x')
    for (const bad of ['../x', 'a/b', '', '.', '..', '...', '/etc/passwd', 'a\0b', 'x'.repeat(500)]) {
      const n = safeName(bad, 'fb')
      expect(n).toMatch(/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/)
      expect(n).not.toContain('/')
      expect(['.', '..']).not.toContain(n)
    }
    expect(safeName('', 'fb')).toBe('fb')
    expect(safeName('a/b', 'fb')).toBe('a_b')
  })

  test('main thread and subagents get different files', () => {
    expect(logPath('s1', undefined)).toBe('s1/main.jsonl')
    expect(logPath('s1', 'code reviewer')).toBe('s1/code_reviewer.jsonl')
    expect(logPath(undefined, '../..')).toBe('unknown/___...jsonl')
  })

  test('summarize keeps short known fields and never file contents', () => {
    expect(summarize({ file_path: '/a', content: 'SECRET', new_string: 'SECRET' })).toBe('file_path=/a')
    expect(summarize({ content: 'x' })).toBeUndefined()
    expect(summarize({ pattern: 'p'.repeat(1000) })!.length).toBeLessThanOrEqual(500)
  })

  test('buildRecord caps the command and keeps key order', () => {
    const r = buildRecord({ id: 'i', ts: 't', tool: 'Bash', cwd: '/c', command: 'x'.repeat(5000), blocked: null, isError: false })
    expect(r.command!.length).toBe(4000)
    expect(Object.keys(JSON.parse(JSON.stringify(r)))).toEqual(['id', 'ts', 'tool', 'cwd', 'command', 'blocked', 'isError'])
  })
})

describe('command parsing', () => {
  test('each form', () => {
    expect(parseCommand(undefined)).toEqual({ kind: 'summary' })
    expect(parseCommand('  ')).toEqual({ kind: 'summary' })
    expect(parseCommand('help')).toEqual({ kind: 'help' })
    expect(parseCommand('blocked')).toEqual({ kind: 'blocked', n: 10 })
    expect(parseCommand('blocked 25')).toEqual({ kind: 'blocked', n: 25 })
    expect(parseCommand('blocked 0').kind).toBe('error')
    expect(parseCommand('blocked 101').kind).toBe('error')
    expect(parseCommand('blocked x').kind).toBe('error')
    expect(parseCommand('query select 1')).toEqual({ kind: 'query', sql: 'select 1' })
    expect(parseCommand('query select 1;')).toEqual({ kind: 'query', sql: 'select 1;' })
    expect(parseCommand('query').kind).toBe('error')
    expect(parseCommand('query .shell ls').kind).toBe('error')
    expect(parseCommand('nope').kind).toBe('error')
  })

  test('cap truncates long output', () => {
    expect(cap('ok')).toBe('ok')
    expect(cap('x'.repeat(9000))).toMatch(/\[truncated/)
  })
})

describe('tool.call hook', () => {
  type Opts = { runtime?: 'ok' | 'missing'; run?: () => any; append?: () => any; agents?: any[] }
  async function start($: any, on: any, o: Opts = {}) {
    const runs: any[] = []
    const logs: string[] = []
    on('tool.call', async () => ({ result: 'ok' }))
    on('session.cwd', async () => ({ value: '/w' }))
    on('session.id', async () => ({ value: 'sess1' }))
    on('session.start', async () => ({ cwd: '/w' }))
    on('session.measure', async () => ({ changed: [] }))
    on('clock.now', async () => ({ value: 1_000_000 }))
    on('agent.list', async () => ({ value: o.agents ?? [] }))
    on('ui.log', async (_$: any, e: any) => {
      logs.push(JSON.stringify(e))
      return { value: undefined }
    })
    on('process.run', async (_$: any, e: any) => {
      runs.push(e)
      const script: string = e.argv[2] ?? ''
      if (script.includes('command -v node')) return { value: { exitCode: o.runtime === 'missing' ? 1 : 0, stdout: '', stderr: '' } }
      if (script.includes('metrics.mjs')) return o.run ? o.run() : { value: { exitCode: 0, stdout: 'TABLE\n', stderr: '' } }
      if (script.includes('cat >>')) return o.append ? o.append() : { value: { exitCode: 0, stdout: '', stderr: '' } }
      return { value: { exitCode: 1, stdout: '', stderr: '' } }
    })
    await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
    return { runs, logs }
  }
  const appends = (runs: any[]) => runs.filter(r => (r.argv[2] ?? '').includes('cat >>'))
  const queries = (runs: any[]) => runs.filter(r => (r.argv[2] ?? '').includes('metrics.mjs'))

  test('a sed read is denied and the deny is logged on the main thread, command on stdin only', async ($, on) => {
    const { runs } = await start($, on)
    const out: any = await $.tool.call({ tool: 'Bash', command: "sed -n '1,5p' f", tool_use_id: 'tu1' })
    expect(out.deny).toMatch(/^tool-mgr: .*Read/)
    const a = appends(runs)
    expect(a).toHaveLength(1)
    expect(a[0].argv.slice(5)).toEqual(['sess1/main.jsonl'])
    expect(typeof a[0].argv[4]).toBe('string') // the plugin root, as argv
    expect(JSON.stringify(a[0].argv)).not.toContain('sed -n')
    expect(JSON.parse(a[0].init.stdin)).toMatchObject({ id: 'tu1', tool: 'Bash', command: "sed -n '1,5p' f", blocked: 'sed-read', isError: false, cwd: '/w', session: 'sess1', tool_use_id: 'tu1' })
  })

  test('a subagent deny is keyed by its agent type, like the hook records', async ($, on) => {
    const { runs } = await start($, on, { agents: [{ id: 'ag1', type: 'Explore', name: 'scout' }] })
    await $.tool.call({ tool: 'Bash', command: 'sed -n 1p f', agentId: 'ag1' })
    const a = appends(runs)[0]
    expect(a.argv[5]).toBe('sess1/Explore.jsonl')
    expect(JSON.parse(a.init.stdin)).toMatchObject({ agent: 'Explore', agent_type: 'Explore' })
  })

  test('an unknown agent id falls back to the id, sanitized', async ($, on) => {
    const { runs } = await start($, on)
    await $.tool.call({ tool: 'Bash', command: 'sed -n 1p f', agentId: '../../x' })
    expect(appends(runs)[0].argv[5]).toBe('sess1/___.._x.jsonl')
  })

  test('a command over the cap goes through unchecked', async ($, on) => {
    const { runs } = await start($, on)
    const out: any = await $.tool.call({ tool: 'Bash', command: 'sed -n 1p f ' + 'x'.repeat(5000) })
    expect(out.deny).toBeUndefined()
    expect(appends(runs)).toEqual([])
  })

  test('calls that are not denied are not logged by the mod', async ($, on) => {
    const { runs } = await start($, on)
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await $.tool.call({ tool: 'Write', file_path: '/a', content: 'x' })
    expect(appends(runs)).toEqual([])
  })

  test('a failing deny-log append does not change the deny', async ($, on) => {
    await start($, on, { append: () => ({ value: { exitCode: 1, stdout: '', stderr: 'disk full' } }) })
    const out: any = await $.tool.call({ tool: 'Bash', command: 'sed -n 1p f' })
    expect(out.deny).toMatch(/^tool-mgr:/)
    expect(((await $.tool.call({ tool: 'Bash', command: 'ls' })) as any).deny).toBeUndefined()
  })

  test('a runtime that is not ready is quiet at start, reported once after a turn, and denies nothing', async ($, on) => {
    const { logs } = await start($, on, { runtime: 'missing' })
    expect(logs.filter(l => l.includes('metrics runtime not ready'))).toHaveLength(0)
    await $.session.measure({ changed: [] })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await $.session.measure({ changed: [] })
    expect(logs.filter(l => l.includes('metrics runtime not ready'))).toHaveLength(1)
    expect(((await $.tool.call({ tool: 'Bash', command: 'sed -n 1p f' })) as any).deny).toMatch(/^tool-mgr:/)
  })

  test('/tool-mgr sends the request on stdin, never argv', async ($, on) => {
    const { runs } = await start($, on)
    const text = async (args: string) => JSON.stringify(await $.command.run({ command: 'tool-mgr', args }))
    expect(await text('help')).toMatch(/\/tool-mgr query/)
    expect(queries(runs)).toEqual([])
    expect(await text('')).toMatch(/TABLE/)
    expect(JSON.parse(queries(runs).at(-1).init.stdin)).toEqual({ kind: 'summary' })
    expect(await text('blocked 3')).toMatch(/TABLE/)
    expect(JSON.parse(queries(runs).at(-1).init.stdin)).toEqual({ kind: 'blocked', n: 3 })
    expect(await text('query select 42')).toMatch(/TABLE/)
    const q = queries(runs).at(-1)
    expect(JSON.parse(q.init.stdin)).toEqual({ kind: 'query', sql: 'select 42' })
    expect(JSON.stringify(q.argv)).not.toContain('select 42')
    expect(await text('blocked nope')).toMatch(/blocked takes one number/)
  })

  test('a failing metrics script comes back as text, not a thrown error', async ($, on) => {
    await start($, on, { run: () => ({ value: { exitCode: 1, stdout: '', stderr: 'metrics.duckdb is locked by another session' } }) })
    const out: any = await $.command.run({ command: 'tool-mgr', args: '' })
    expect(JSON.stringify(out)).toMatch(/tool-mgr: metrics.duckdb is locked/)
  })
})
