import { describe, expect, mock, test } from 'claude-code/testing'
import { PRIMER } from '../hooks/rules/hygiene'

// The mod through the engine: the parser's denies and passes, then the model stages with Ollama (`http.fetch`) and the
// fallback (`model.complete`) stubbed. Each test runs at its own clock time and uses its own commands, so the module's
// verdict cache and Ollama backoff cannot carry over between tests.
//
// The mod runs with its manifest defaults (a test cannot pass options): ollamaModel `clef:cloud` with ollamaCloud off, so
// the Ollama stage is skipped and the fallback decides. Ollama's requests and replies are covered in judge.test.ts.

type World = { fetches: any[]; completes: any[]; ran: string[]; inputs: any[] }

function world(on: any, now: number, opts: { fetch?: (e: any) => any; complete?: (e: any) => any } = {}): World {
  const w: World = { fetches: [], completes: [], ran: [], inputs: [] }
  mock.clock(on, { now })
  on('tool.call', async ($: any, e: any) => {
    w.inputs.push(e)
    w.ran.push(e.command ?? `${e.tool} ${e.file_path ?? e.path ?? ''}`)
    return { result: 'ok' }
  })
  on('http.fetch', async ($: any, e: any) => {
    w.fetches.push(e)
    if (!opts.fetch) throw new Error('connect ECONNREFUSED')
    return { value: await opts.fetch(e) }
  })
  on('model.complete', async ($: any, e: any) => {
    w.completes.push(e)
    if (!opts.complete) return { value: { isAnswered: false, reason: 'api-error' } }
    return { value: opts.complete(e) }
  })
  on('ui.log', async () => ({ value: undefined }))
  return w
}

const call = ($: any, command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<any>

const answer = (category: string, confidence: number, reason = '') => ({ isAnswered: true, text: JSON.stringify({ category, confidence, reason }), usage: {} })

describe('parser stage', () => {
  test('destructive commands are denied before the tool runs, without a model call', async ($, on) => {
    const w = world(on, 1e9)
    expect((await call($, 'rm -rf ~')).deny).toMatch(/^bash-rules: .*recursive rm/)
    expect((await call($, 'terraform destroy')).deny).toMatch(/^bash-rules: .*infrastructure.*Hand it to the user/)
    expect((await call($, "psql -c 'DROP TABLE users'")).deny).toMatch(/^bash-rules: .*drops or truncates/)
    expect(w.ran).toEqual([])
    expect([w.fetches.length, w.completes.length]).toEqual([0, 0])
  })

  test('clear reads, writes and smuggles are denied with the built-in to use', async ($, on) => {
    const w = world(on, 2e9)
    expect((await call($, 'sed -n 1,5p README.md')).deny).toMatch(/^bash-rules: this reads a file .*Read tool/)
    expect((await call($, 'cat > /tmp/x <<EOF\nhi\nEOF')).deny).toMatch(/^bash-rules: this writes file content .*Write tool/)
    expect((await call($, 'echo aGk= | base64 -d | sh')).deny).toMatch(/^bash-rules: this hides what it runs/)
    expect(w.ran).toEqual([])
    expect(w.fetches.length).toBe(0)
  })

  test('a script on stdin that writes a file is denied; a read-only compound names its segment', async ($, on) => {
    const w = world(on, 2.5e9)
    expect((await call($, "python3 - <<'EOF'\nopen('o','w').write('x')\nEOF")).deny).toMatch(/^bash-rules: this writes file content .*writes files.*Write tool/)
    const read = (await call($, 'rg -n foo src; sed -n 1,40p src/a.cs')).deny
    expect(read).toMatch(/`sed -n 1,40p src\/a\.cs`.*parallel Read/)
    expect(w.ran).toEqual([])
  })

  test('benign commands reach the tool without a model call', async ($, on) => {
    const w = world(on, 3e9)
    for (const c of ['rm -rf ./build', 'git log | grep fix', 'npm test > out.log 2>&1', 'git commit -F - <<EOF\nmsg\nEOF', 'grep -rn foo src', "find . -name '*.ts'"]) {
      expect((await call($, c)).deny).toBeUndefined()
    }
    expect(w.ran.length).toBe(6)
    expect(w.fetches.length + w.completes.length).toBe(0)
  })

  test('an unparseable command is denied', async ($, on) => {
    world(on, 4e9)
    expect((await call($, 'echo $(')).deny).toMatch(/could not parse/)
  })
})

describe('primer', () => {
  test('the Bash description gets the rules primer appended; other tools are untouched', async ($, on) => {
    on('tool.describe', async (_$: any, e: any) => ({ description: e.description }))
    const engine = { plugin: 'engine', tier: 'core' } as never
    const bash = (await $.tool.describe({ tool: 'Bash', description: 'Run a command.', provider: engine })).description as string
    expect(bash.startsWith('Run a command.\n\n')).toBe(true)
    expect(bash.endsWith(PRIMER)).toBe(true)
    expect((await $.tool.describe({ tool: 'Read', description: 'Read a file.', provider: engine })).description).toBe('Read a file.')
  })

  test('the primer builds on a description a lower hook changed', async ($, on) => {
    on('tool.describe', async () => ({ description: 'Lower hook text.' }))
    const bash = (await $.tool.describe({ tool: 'Bash', description: 'Run a command.', provider: { plugin: 'engine', tier: 'core' } as never })).description as string
    expect(bash).toBe(`Lower hook text.\n\n${PRIMER}`)
  })

  // `primer: false` is not tested: an inline test plugin cannot import this register or receive options.

  test('the primer is short and states the rules', () => {
    expect(PRIMER.length).toBeLessThanOrEqual(600)
    expect(PRIMER).toMatch(/parallel/)
    expect(PRIMER).toMatch(/\; and &&/)
    expect(PRIMER).toMatch(/Write or Edit/)
    expect(PRIMER).toMatch(/grep, rg, find, ls and git stay in Bash/)
  })
})

describe('model stages', () => {
  test('the default clef:cloud model is never sent the command; the fallback decides, and the verdict is cached', async ($, on) => {
    const w = world(on, 5e9, { fetch: () => ({ status: 200, ok: true, headers: {}, text: '{}' }), complete: () => answer('read', 0.95, 'prints a file') })
    const out = await call($, "sed 's/a/b/' notes.txt")
    expect(out.deny).toMatch(/^bash-rules: a model check found this command reads a file .*\(prints a file\)/)
    expect(w.fetches).toHaveLength(0)
    expect(w.completes).toHaveLength(1)
    expect(w.completes[0].model).toBe('haiku')
    expect(w.completes[0].prompt).toContain("<command>\nsed 's/a/b/' notes.txt\n</command>")
    expect((await call($, "sed 's/a/b/' notes.txt")).deny).toBeDefined()
    expect([w.fetches.length, w.completes.length]).toEqual([0, 1])
  })

  test('a none from the fallback lets the command run', async ($, on) => {
    const w = world(on, 6e9, { complete: () => answer('none', 0.9) })
    expect((await call($, "awk '{s+=$1} END {print s}' sizes.txt")).deny).toBeUndefined()
    expect(w.ran).toEqual(["awk '{s+=$1} END {print s}' sizes.txt"])
    expect(w.completes).toHaveLength(1)
  })

  test("the fallback's answer is final, whatever its confidence", async ($, on) => {
    const w = world(on, 7e9, { complete: () => answer('write', 0.4, 'echo of a variable into a file') })
    expect((await call($, 'echo "$CONFIG" > app.conf')).deny).toMatch(/model check found this command writes file content/)
    expect(w.completes).toHaveLength(1)
    expect(w.completes[0].prompt).toContain('<command>\necho "$CONFIG" > app.conf\n</command>')
  })

  test('secrets in the command are masked before the fallback sees it', async ($, on) => {
    const w = world(on, 8e9, { complete: () => answer('none', 0.9) })
    await call($, 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE eval "$(cat setup2.out)"')
    expect(w.completes).toHaveLength(1)
    expect(w.completes[0].prompt).not.toContain('AKIA')
    expect(w.completes[0].prompt).toContain('<redacted>')
  })

  test('with the fallback unavailable the command runs (fail open)', async ($, on) => {
    const w = world(on, 10e9)
    expect((await call($, 'eval "$(cat setup.out)"')).deny).toBeUndefined()
    expect(w.ran).toEqual(['eval "$(cat setup.out)"'])
    expect([w.fetches.length, w.completes.length]).toEqual([0, 1])
  })

  test('an unreadable fallback reply fails open too', async ($, on) => {
    const w = world(on, 11e9, { complete: () => 'sure, looks fine' })
    expect((await call($, 'python3 -c "exec(input())"')).deny).toBeUndefined()
    expect(w.ran).toHaveLength(1)
  })
})

describe('file tools and the credentials file', () => {
  const env = (on: any, vars: Record<string, string>) => {
    on('session.cwd', async () => ({ value: '/home/u/proj' }))
    on('env.get', async (_$: any, e: any) => ({ value: vars[e.name] }))
  }
  const tool = ($: any, input: Record<string, unknown>) => $.tool.call(input as never) as Promise<any>

  test('Read, Edit, Write, MultiEdit and NotebookEdit of the file are denied before the tool runs', async ($, on) => {
    const w = world(on, 20e9)
    env(on, { HOME: '/home/u' })
    for (const input of [
      { tool: 'Read', file_path: '/home/u/.claude/.credentials.json' },
      { tool: 'Read', file_path: '~/.claude/.credentials.json' },
      { tool: 'Read', file_path: '../.claude/./.credentials.json' },
      { tool: 'Edit', file_path: '/home/u/.claude/.credentials.json', old_string: 'a', new_string: 'b' },
      { tool: 'MultiEdit', file_path: '/home/u/.claude/.credentials.json', edits: [] },
      { tool: 'Write', file_path: '/home/u/.claude/.credentials.json', content: '{}' },
      { tool: 'NotebookEdit', notebook_path: '/home/u/.claude/.credentials.json', new_source: '' },
    ]) {
      expect([input.tool, (await tool($, input)).deny]).toEqual([input.tool, expect.stringMatching(/^bash-rules: refusing to read, search or change .*rate_limits/)])
    }
    expect(w.ran).toEqual([])
  })

  test('the CLAUDE_CONFIG_DIR copy is protected too; other files run', async ($, on) => {
    const w = world(on, 21e9)
    env(on, { HOME: '/home/u', CLAUDE_CONFIG_DIR: '/srv/claude-cfg' })
    expect((await tool($, { tool: 'Read', file_path: '/srv/claude-cfg/.credentials.json' })).deny).toMatch(/refusing to read/)
    expect((await tool($, { tool: 'Read', file_path: '/home/u/.claude/settings.json' })).deny).toBeUndefined()
    expect((await tool($, { tool: 'Read', file_path: 'src/credentials.json' })).deny).toBeUndefined()
    expect((await tool($, { tool: 'Write', file_path: '/tmp/out.txt', content: 'x' })).deny).toBeUndefined()
    expect(w.ran).toHaveLength(3)
  })

  test('Grep of the file, or of its directory with a glob that can match it, is denied', async ($, on) => {
    const w = world(on, 22e9)
    env(on, { HOME: '/home/u' })
    for (const input of [
      { tool: 'Grep', pattern: 'token', path: '~/.claude', glob: '*.json' },
      { tool: 'Grep', pattern: 'token', path: '/home/u/.claude' },
      { tool: 'Grep', pattern: 'token', path: '/home/u/.claude/.credentials.json' },
      { tool: 'Grep', pattern: 'token', path: '/home/u', glob: '**/*.json' },
      { tool: 'Grep', pattern: 'token', path: '/home/u/.claude', glob: '*.{ts,json}' },
    ]) {
      expect([input, (await tool($, input)).deny]).toEqual([input, expect.stringMatching(/refusing to read, search/)])
    }
    for (const input of [
      { tool: 'Grep', pattern: 'token', path: 'src' },
      { tool: 'Grep', pattern: 'token', path: '/home/u/.claude', glob: '*.md' },
      { tool: 'Grep', pattern: 'token', path: '/home/u/.claude', type: 'ts' },
      { tool: 'Grep', pattern: 'token', path: '/home/u', glob: '*.md' },
      { tool: 'Grep', pattern: 'token', path: '/home/u', type: 'jsonl' },
      { tool: 'Grep', pattern: 'token', path: '.claude', glob: '*.json' },
    ]) {
      expect([input, (await tool($, input)).deny]).toEqual([input, undefined])
    }
    expect(w.ran).toHaveLength(6)
    // Calls that do not reach the file run as given.
    expect(w.inputs.every(e => e.glob === undefined || !String(e.glob).includes('credentials'))).toBe(true)
  })

  test('Grep of a directory above the file with no glob runs with the file excluded; a json type is a matching glob', async ($, on) => {
    const w = world(on, 24e9)
    env(on, { HOME: '/home/u', CLAUDE_CONFIG_DIR: '/srv/claude-cfg' })
    for (const path of ['~', '/', '..', '/home/u', '/srv', '/home/u/proj/../..']) {
      const out = await tool($, { tool: 'Grep', pattern: 'accessToken', path })
      expect([path, out.deny]).toEqual([path, undefined])
    }
    expect(w.inputs.map(e => [e.path, e.glob])).toEqual([
      ['~', '!**/.credentials.json'],
      ['/', '!**/.credentials.json'],
      ['..', '!**/.credentials.json'],
      ['/home/u', '!**/.credentials.json'],
      ['/srv', '!**/.credentials.json'],
      ['/home/u/proj/../..', '!**/.credentials.json'],
    ])
    expect(w.inputs[0]).toMatchObject({ tool: 'Grep', pattern: 'accessToken' })
    for (const input of [
      { tool: 'Grep', pattern: 'accessToken', path: '~', type: 'json' },
      { tool: 'Grep', pattern: 'accessToken', path: '/', type: 'JSON' },
      { tool: 'Grep', pattern: 'accessToken', path: '..', glob: '**/*.json' },
      { tool: 'Grep', pattern: 'accessToken', path: '/home/u', glob: ' ' , type: 'json' },
    ]) {
      expect([input, (await tool($, input)).deny]).toEqual([input, expect.stringMatching(/refusing to read, search/)])
    }
    expect(w.ran).toHaveLength(6)
  })

  test('a path that ends in the CLAUDE_CONFIG_DIR file is the file', async ($, on) => {
    const w = world(on, 25e9)
    env(on, { HOME: '/home/u', CLAUDE_CONFIG_DIR: '/srv/claude-cfg' })
    for (const file_path of ['/proc/self/root/srv/claude-cfg/.credentials.json', '/proc/1/root/srv/claude-cfg/./.credentials.json', '/SRV/Claude-Cfg/.credentials.json']) {
      expect([file_path, (await tool($, { tool: 'Read', file_path })).deny]).toEqual([file_path, expect.stringMatching(/refusing to read/)])
    }
    for (const file_path of ['/srv/other-claude-cfg/.credentials.json', '/srv/claude-cfg/settings.json']) {
      expect([file_path, (await tool($, { tool: 'Read', file_path })).deny]).toEqual([file_path, undefined])
    }
    expect(w.ran).toHaveLength(2)
  })

  test('an over-long path or glob is refused unchecked', async ($, on) => {
    world(on, 23e9)
    env(on, { HOME: '/home/u' })
    expect((await tool($, { tool: 'Read', file_path: '/' + 'a/'.repeat(3000) })).deny).toMatch(/too long to check/)
    expect((await tool($, { tool: 'Grep', pattern: 'x', glob: '*'.repeat(2000) })).deny).toMatch(/too long to check/)
  })
})

describe('usage log', () => {
  // Captures the lines the mod appends through `$.process.run`, and the file each goes to.
  const logs = (on: any) => {
    const lines: any[] = []
    on('session.id', async () => ({ value: 'sess-1' }))
    on('process.run', async (_$: any, e: any) => {
      lines.push({ file: e.argv[4], ...JSON.parse(e.init.stdin) })
      return { value: { exitCode: 0, stdout: '', stderr: '' } }
    })
    return lines
  }

  test('a deny, a pass and a model verdict are each logged with the stage that decided', async ($, on) => {
    world(on, 14e9, { complete: () => answer('read', 0.95) })
    const lines = logs(on)
    await call($, 'sed -n 1,5p README.md')
    await call($, 'grep -rn foo src')
    await call($, "sed 's/a/b/' notes2.txt")
    expect(lines.map(l => [l.kind, l.decision, l.stage])).toEqual([
      ['bash', 'deny', 'hygiene'],
      ['bash', 'allow', 'hygiene'],
      ['bash', 'deny', 'model'],
    ])
    expect(lines[0]).toMatchObject({ v: 1, session: 'sess-1', category: 'read', tool: 'Read', command: 'sed -n 1,5p README.md' })
    expect(lines[0].file).toMatch(/^bash-rules-\d{4}-\d{2}-\d{2}\.jsonl$/)
    expect(lines[1]).toMatchObject({ isError: false, ms: expect.any(Number) })
    expect(lines[2].model).toMatchObject({ source: 'fallback', category: 'read', confidence: 0.95 })
  })

  test('a classic-hook deny that comes back as a tool error is logged as denied-later; other errors stay allow', async ($, on) => {
    mock.clock(on, { now: 16e9 })
    const lines = logs(on)
    const denyText = 'PreToolUse:Bash hook error: Save a plan with -out=tfplan, then apply that file.'
    on('tool.call', async (_$: any, e: any) => (e.command.startsWith('mise run') ? { isError: true, result: denyText, text: denyText } : { isError: true, result: 'exit 1', text: 'exit 1' }))
    await call($, 'mise run tofu core apply -target=module.forgejo01 -auto-approve -no-color')
    await call($, 'false')
    expect(lines.map(l => [l.decision, l.isError])).toEqual([['denied-later', undefined], ['allow', true]])
    expect(lines[0].message).toBe(denyText)
  })

  test('a deny from a lower classic.PreToolUse is logged as denied-later even without error text', async ($, on) => {
    mock.clock(on, { now: 17e9 })
    const lines = logs(on)
    on('classic.PreToolUse', async () => ({ deny: 'blocked by a lower hook' }))
    on('tool.call', async () => ({ isError: true, result: 'x', text: '' }))
    await call($, 'mise run tofu core apply -auto-approve')
    expect(lines.map(l => [l.decision, l.message])).toEqual([['denied-later', 'blocked by a lower hook']])
  })

  test('secrets in a command are masked before they are written', async ($, on) => {
    world(on, 15e9)
    const lines = logs(on)
    await call($, 'curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwx" https://x | jq . && GH_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz123456 gh api user')
    expect(lines[0].command).not.toMatch(/abcdefghijklmnopqrstuvwx|ghp_/)
    expect(lines[0].command).toContain('Bearer <token>')
  })
})

// classic.PreToolUse cannot be fired through `$` in a test; withAsk and its git-clean exemption are covered in
// destructive.test.ts and danger.test.tsx.

describe('SQL script files', () => {
  const files = (on: any, contents: Record<string, string>) => {
    on('session.cwd', async () => ({ value: '/w' }))
    on('fs.stat', async ($: any, e: any) => {
      const text = contents[e.path]
      if (text === undefined) throw new Error('ENOENT')
      return { value: { kind: 'file', size: text.length, isSymlink: false } }
    })
    on('fs.read', async ($: any, e: any) => ({ value: contents[e.path] }))
  }

  test('a script file that drops or truncates is denied; a clean one runs', async ($, on) => {
    const w = world(on, 12e9)
    files(on, { '/w/drop.sql': 'BEGIN;\nDROP TABLE users;\nCOMMIT;', '/w/seed.sql': 'insert into t values (1);', '/srv/flush.txt': 'FLUSHALL' })
    expect((await call($, 'psql -f drop.sql')).deny).toMatch(/^bash-rules: .*drops or truncates/)
    expect((await call($, 'mysql app < drop.sql')).deny).toMatch(/drops or truncates/)
    expect((await call($, 'redis-cli < /srv/flush.txt')).deny).toMatch(/drops or truncates/)
    expect((await call($, 'psql -f seed.sql')).deny).toBeUndefined()
    expect(w.ran).toEqual(['psql -f seed.sql'])
    expect(w.fetches.length + w.completes.length).toBe(0)
  })

  test('a script file that cannot be read is not sent to a model; the classic.PreToolUse ask covers it', async ($, on) => {
    const w = world(on, 13e9, { complete: () => answer('read', 1) })
    files(on, { '/w/big.sql': 'x'.repeat(256 * 1024 + 1) })
    for (const c of ['psql -f missing.sql', 'psql -f "$F"', 'mysql app < big.sql']) expect((await call($, c)).deny).toBeUndefined()
    expect(w.ran).toEqual(['psql -f missing.sql', 'psql -f "$F"', 'mysql app < big.sql'])
    expect(w.fetches.length + w.completes.length).toBe(0)
  })
})
