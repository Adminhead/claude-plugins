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
    expect(rule('echo "a << b" > output.txt')).toBe('echo-write')
    expect(rule("echo 'a << b' > output.txt")).toBe('echo-write')
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
      'ls > f',
      "python -c 'open(\"a\",\"w\")'",
    ]) {
      expect(rule(c)).toBeNull()
    }
  })

  test('interpreter heredocs in any shape are blocked when the body writes files', () => {
    for (const c of [
      "python3 - <<'EOF'\nfrom pathlib import Path\nPath('a').open('w')\nEOF",
      "python3 /dev/stdin <<EOF\nopen('a', 'w')\nEOF",
      "cat <<EOF | python3\nPath('a').write_text('x')\nEOF",
      "cat <<'EOF' | node -\nrequire('fs').createWriteStream('a')\nEOF",
      "cd x && python3 - <<EOF\nimport shutil\nshutil.copy('a', 'b')\nEOF",
      "python3 - <<EOF\nimport shutil\nshutil.move('a', 'b')\nEOF",
      "python3 - <<EOF\nimport os\nos.replace('a', 'b')\nEOF",
      "python3 - <<EOF\nos.rename('a', 'b')\nEOF",
      "python3 - <<EOF\nfileinput.input('a', inplace=True)\nEOF",
      "node <<EOF\nfs.promises.copyFile('a', 'b')\nEOF",
      "node <<EOF\nfs.rename('a', 'b', cb)\nEOF",
      "bun <<EOF\nBun.write('a', 'x')\nEOF",
      "deno run - <<EOF\nawait Deno.writeTextFile('a', 'x')\nEOF",
      "deno run - <<EOF\nawait Deno.writeFile('a', b)\nEOF",
      "ruby <<EOF\nFile.write('a', 'x')\nEOF",
      "ruby <<EOF\nIO.write('a', 'x')\nEOF",
      "ruby <<EOF\nFile.open('a', 'w') { |f| f.puts 1 }\nEOF",
      "perl <<EOF\nopen(my $fh, '>', 'a');\nEOF",
      'perl <<EOF\nopen(FH, ">a");\nEOF',
      "perl <<EOF\nopen($fh, '>>', 'a');\nEOF",
      "bash <<EOF\necho a > f\nEOF",
      "sh <<EOF\nls | tee out.txt\nEOF",
      "zsh <<'EOF'\nsed -i 's/a/b/' f\nEOF",
      "bash <<EOF\nperl -pi -e 's/a/b/' f\nEOF",
      'cat >| f <<EOF\nx\nEOF',
    ]) {
      expect(rule(c)).toBe('heredoc-write')
    }
  })

  test('interpreter heredocs that only read or print, and mere mentions, pass', () => {
    for (const c of [
      "python3 - <<EOF\nprint(open('f').read())\nEOF",
      "cat <<EOF | python3\nprint(open('f').read())\nEOF",
      "bash <<EOF\necho a\nls > /dev/null\necho b >&2\nEOF",
      "sh <<EOF\nls | tee /dev/null\nEOF",
      'git commit -F - <<EOF\nuse write_text and shutil.copy\nEOF',
      'git commit -m "$(cat <<\'EOF\'\nfix node writeFile; python3 Path.write_text\nEOF\n)"',
      'git commit -m "bump node" -F - <<EOF\nwriteFileSync\nEOF',
      'cat <<EOF | jq .\n{"a": "writeFile"}\nEOF',
      "python3 <<<'open(\"a\",\"w\")'",
      "perl <<EOF\nopen(my $fh, '<', 'a');\nEOF",
    ]) {
      expect(rule(c)).toBeNull()
    }
  })

  test('path-qualified and wrapped interpreters are blocked when the body writes files', () => {
    for (const c of [
      ".venv/bin/python - <<EOF\nopen('a', 'w')\nEOF",
      "/usr/bin/python3 - <<EOF\nopen('a', 'w')\nEOF",
      "/usr/bin/env python3 - <<EOF\nopen('a', 'w')\nEOF",
      "timeout 60 python3 - <<EOF\nopen('a', 'w')\nEOF",
      "sudo -u x python3 - <<EOF\nopen('a', 'w')\nEOF",
      "uv run --with x python - <<EOF\nopen('a', 'w')\nEOF",
      "FOO=1 nice -n 5 node - <<EOF\nrequire('fs').writeFileSync('a', 'x')\nEOF",
      'cat <<EOF | tee /dev/null f\nx\nEOF',
    ]) {
      expect(rule(c)).toBe('heredoc-write')
    }
  })

  test('each heredoc is judged by its own command and body', () => {
    for (const c of [
      'bun test && git commit -F - <<EOF\nfeat: add overwriteFile helper\nEOF',
      'python3 -m pytest && git commit -F - <<EOF\nfix: os.rename( call\nEOF',
      'node build.mjs; git commit -F - <<EOF\nuse fs.rename(\nEOF',
      'python3 - <<EOF\nprint(1)\nEOF\ngit commit -F - <<MSG\nuse shutil.copy(\nMSG',
      'bash <<EOF\necho hi\nEOF\ngit commit -F - <<MSG\nfix a > b\nMSG',
      "node tool.js <<EOF\nrequire('fs').writeFileSync('a', 'x')\nEOF",
      "python3 tool.py <<EOF\nopen('a', 'w')\nEOF",
    ]) {
      expect(rule(c)).toBeNull()
    }
    expect(rule("python3 - <<EOF\nprint(1)\nEOF\npython3 - <<MSG\nopen('a', 'w')\nMSG")).toBe('heredoc-write')
  })

  test('read-only code that resembles file APIs passes', () => {
    for (const c of [
      "python3 - <<EOF\ndf.drop(columns=['a'], inplace=True)\nEOF",
      "python3 - <<EOF\ndf.rename(columns={'a': 'b'})\nEOF",
      "python3 - <<EOF\nprint('rename(')\nEOF",
      "node - <<EOF\nconsole.log('writeFile')\nEOF",
      'node - <<EOF\noverwriteFile(x)\nEOF',
    ]) {
      expect(rule(c)).toBeNull()
    }
  })

  test('shell bodies: only real in-place edits, files and tees count', () => {
    for (const c of [
      'bash <<EOF\nsed s/a/b/ f | grep -i foo\nEOF',
      'bash <<EOF\nperl -Mstrict -e print\nEOF',
      'bash <<EOF\nsed 1p f; find . -print\nEOF',
      'bash <<EOF\necho tee file\nEOF',
      'bash <<EOF\necho $((1 > 0))\nEOF',
      'bash <<EOF\n[[ a > b ]] && ls\nEOF',
      'bash <<EOF\n(( x > 3 ))\nEOF',
    ]) {
      expect(rule(c)).toBeNull()
    }
  })

  test('printf and echo redirects to a file are blocked', () => {
    for (const c of [
      "printf '%s\\n' a > f",
      'echo hi >> notes.md',
      'cd x && printf x >out',
      'echo a 1>f',
      'echo a >| f',
      'echo a &> f',
      'builtin printf x > f',
      'command printf x > f',
      'echo hi 2>&1 > f',
      'echo hi > "out file"',
      '(echo hi > f)',
      'printf x | tee f',
      'echo x | tee -a f',
      'echo x | tee /dev/null f',
    ]) {
      expect(rule(c)).toBe('echo-write')
    }
  })

  test('printf and echo that write no file pass', () => {
    for (const c of [
      'echo hi',
      'echo hi >&2',
      'echo hi 1>&2',
      'printf x 2>/dev/null',
      'echo hi > /dev/null',
      'echo hi > /dev/stderr',
      'printf x > /dev/stdout',
      'echo hi > /dev/tty',
      'echo "a > b"',
      "echo 'a > b'",
      'printf x | cat',
      'printf x | tee /dev/null',
      'printf x | wc -c > count.txt',
    ]) {
      expect(rule(c)).toBeNull()
    }
  })

  test('a sed line inside a heredoc body is not a sed read', () => {
    expect(rule('git commit -F - <<EOF\nsed -n 1p f\nEOF')).toBeNull()
  })

  test('sed fed by a here-string or a heredoc reads no file, but sed < file does', () => {
    for (const c of ['sed -n p <<< "$x"', 'sed p <<EOF\nx\nEOF']) expect(rule(c)).toBeNull()
    expect(rule('sed -n p < f')).toBe('sed-read')
  })

  test('rules see commands inside compound commands, substitutions, assignments and -c bodies', () => {
    for (const c of ['if true; then sed -n 1p f; fi', 'echo $(sed -n 1p f)', "bash -c 'sed -n 1p f'", 'FOO=1 sed -n p f']) expect(rule(c)).toBe('sed-read')
    for (const c of ['{ echo a; } > f', 'echo>f', 'echo hi >& f', "bash -lc 'echo hi > f'", "eval 'printf x | tee f'"]) expect(rule(c)).toBe('echo-write')
    expect(rule("sh -c 'cat <<EOF > f\nx\nEOF'")).toBe('heredoc-write')
  })

  test('a redirect elsewhere in the command does not make a heredoc a write', () => {
    expect(rule('ls > f; git commit -F - <<EOF\nmsg\nEOF')).toBeNull()
  })

  test('parse errors are reported, including those in nested scripts and heredoc bodies', () => {
    expect(classify('echo $(')?.rule).toBe('parse-error')
    expect(classify("bash -c 'echo $('")?.rule).toBe('parse-error')
    expect(classify('bash <<EOF\necho $(\nEOF')?.rule).toBe('parse-error')
    expect(classify('echo $(')?.message).toMatch(/plain bash, or write a script file/)
  })

  test('a command over 64 KB is denied unparsed', () => {
    expect(classify('x'.repeat(65536))).toBeNull()
    expect(classify('x'.repeat(65537))?.rule).toBe('too-long')
  })

  test('a long command is checked in full', () => {
    expect(rule('echo ' + 'x'.repeat(10000) + ' > f')).toBe('echo-write')
    expect(rule('sed -n 1p f ' + 'x'.repeat(10000))).toBe('sed-read')
  })

  test('messages start with tool-mgr: and name the built-in tool', () => {
    expect(classify("sed -n 1p f")?.message).toMatch(/^tool-mgr: .*Read/)
    expect(classify('cat > f <<EOF\nx\nEOF')?.message).toMatch(/^tool-mgr: .*Write.*Edit/)
    expect(classify('echo hi > f')?.message).toMatch(/^tool-mgr: .*printf or echo.*Write.*Edit/)
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

  test('a command over the log cap is still checked, and the log keeps only its head', async ($, on) => {
    const { runs } = await start($, on)
    const out: any = await $.tool.call({ tool: 'Bash', command: 'sed -n 1p f ' + 'x'.repeat(5000) })
    expect(out.deny).toMatch(/^tool-mgr: .*Read/)
    expect(JSON.parse(appends(runs)[0].init.stdin).command).toHaveLength(4000)
  })

  test('a parse error and a command over 64 KB are denied and logged under their own rule', async ($, on) => {
    const { runs } = await start($, on)
    const bad: any = await $.tool.call({ tool: 'Bash', command: 'echo $(' })
    expect(bad.deny).toMatch(/^tool-mgr: could not parse this command \(unterminated command substitution\)/)
    const big: any = await $.tool.call({ tool: 'Bash', command: 'x'.repeat(65537) })
    expect(big.deny).toMatch(/^tool-mgr: .*64 KB.*script file/)
    expect(appends(runs).map(a => JSON.parse(a.init.stdin).blocked)).toEqual(['parse-error', 'too-long'])
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
