import { describe, expect, mock, test } from 'claude-code/testing'
import { PRIMER } from '../hooks/rules/hygiene'

// The mod through the engine: the parser's denies and passes, then the model stages with Ollama (`http.fetch`) and the
// fallback (`model.complete`) stubbed. Each test runs at its own clock time and uses its own commands, so the module's
// verdict cache and Ollama backoff cannot carry over between tests.

// A /v1/systemone reply, the endpoint the default model (clef:cloud, a decision model) answers.
const decision = (choice: string, p: number) => {
  const rest = (1 - p) / 3
  const probabilities = Object.fromEntries(['none', 'read', 'write', 'smuggle'].map(l => [l, l === choice ? p : rest]))
  return { status: 200, ok: true, headers: {}, text: JSON.stringify({ model: 'clef', answers: { category: { type: 'choice', choice, probabilities, confidence: 0.5 } } }) }
}

type World = { fetches: any[]; completes: any[]; ran: string[] }

function world(on: any, now: number, opts: { fetch?: (e: any) => any; complete?: (e: any) => any } = {}): World {
  const w: World = { fetches: [], completes: [], ran: [] }
  mock.clock(on, { now })
  on('tool.call', async ($: any, e: any) => {
    w.ran.push(e.command)
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
  return w
}

const call = ($: any, command: string) => $.tool.call({ tool: 'Bash', command } as never) as Promise<any>

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
  test('Ollama decides an unsure command when it is confident, and the verdict is cached', async ($, on) => {
    const w = world(on, 5e9, { fetch: () => decision('read', 0.95) })
    const out = await call($, "sed 's/a/b/' notes.txt")
    expect(out.deny).toMatch(/^bash-rules: a model check found this command reads a file .*\(clef chose read at p=0\.95\)/)
    expect(w.fetches).toHaveLength(1)
    expect(w.fetches[0].url).toBe('http://localhost:11434/v1/systemone')
    expect(w.fetches[0].init.method).toBe('POST')
    const body = JSON.parse(w.fetches[0].init.body)
    expect(body).toMatchObject({ model: 'clef:cloud', questions: { category: { type: 'choice' } } })
    expect(Object.keys(body.questions.category.criteria)).toEqual(['none', 'read', 'write', 'smuggle'])
    expect(body.state).toContain("<command>\nsed 's/a/b/' notes.txt\n</command>")
    expect(w.completes).toHaveLength(0)
    expect((await call($, "sed 's/a/b/' notes.txt")).deny).toBeDefined()
    expect(w.fetches).toHaveLength(1)
  })

  test('a confident none from Ollama lets the command run', async ($, on) => {
    const w = world(on, 6e9, { fetch: () => decision('none', 0.9) })
    expect((await call($, "awk '{s+=$1} END {print s}' sizes.txt")).deny).toBeUndefined()
    expect(w.ran).toEqual(["awk '{s+=$1} END {print s}' sizes.txt"])
  })

  test('low Ollama confidence falls to the fallback model, whose answer is final', async ($, on) => {
    const w = world(on, 7e9, {
      fetch: () => decision('none', 0.4),
      complete: () => ({ isAnswered: true, text: '{"category":"write","confidence":0.7,"reason":"echo of a variable into a file"}', usage: {} }),
    })
    expect((await call($, 'echo "$CONFIG" > app.conf')).deny).toMatch(/model check found this command writes file content/)
    expect(w.completes).toHaveLength(1)
    expect(w.completes[0].model).toBe('haiku')
    expect(w.completes[0].prompt).toContain('<command>\necho "$CONFIG" > app.conf\n</command>')
  })

  test('a missing Ollama model (404) falls through to the fallback, then Ollama is skipped for a while', async ($, on) => {
    const w = world(on, 8e9, {
      fetch: () => ({ status: 404, ok: false, headers: {}, text: '{"error":"model \'clef:cloud\' not found"}' }),
      complete: () => '{"category":"none","confidence":0.9,"reason":"ok"}',
    })
    expect((await call($, 'cat data.csv | mytool --sum')).deny).toBeUndefined()
    expect([w.fetches.length, w.completes.length]).toEqual([1, 1])
    expect((await call($, 'cat other.csv | mytool --avg')).deny).toBeUndefined()
    expect([w.fetches.length, w.completes.length]).toEqual([1, 2])
  })

  test('an Ollama call that outlives the timeout falls through to the fallback', async ($, on) => {
    let clock: any
    const w: World = { fetches: [], completes: [], ran: [] }
    clock = mock.clock(on, { now: 9e9 })
    on('tool.call', async ($: any, e: any) => (w.ran.push(e.command), { result: 'ok' }))
    on('http.fetch', async ($: any, e: any) => {
      w.fetches.push(e)
      await clock.sleep(60_000)
      return { value: decision('read', 1) }
    })
    on('model.complete', async ($: any, e: any) => (w.completes.push(e), { value: '{"category":"smuggle","confidence":0.9,"reason":"runs a variable"}' }))
    const pending = call($, 'bash -c "$CMD"')
    await clock.settle()
    expect(w.completes).toHaveLength(0)
    await clock.advance(8000)
    const out = await pending
    expect(out.deny).toMatch(/model check found this command hides what it runs/)
    expect(w.completes).toHaveLength(1)
  })

  test('with both models unavailable the command runs (fail open)', async ($, on) => {
    const w = world(on, 10e9)
    expect((await call($, 'eval "$(cat setup.out)"')).deny).toBeUndefined()
    expect(w.ran).toEqual(['eval "$(cat setup.out)"'])
    expect([w.fetches.length, w.completes.length]).toEqual([1, 1])
  })

  test('an unreadable fallback reply fails open too', async ($, on) => {
    const w = world(on, 11e9, { complete: () => 'sure, looks fine' })
    expect((await call($, 'python3 -c "exec(input())"')).deny).toBeUndefined()
    expect(w.ran).toHaveLength(1)
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
    world(on, 14e9, { fetch: () => decision('read', 0.95) })
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
    expect(lines[2].model).toMatchObject({ source: 'ollama', category: 'read', confidence: 0.95 })
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
    const w = world(on, 13e9, { fetch: () => decision('read', 1) })
    files(on, { '/w/big.sql': 'x'.repeat(256 * 1024 + 1) })
    for (const c of ['psql -f missing.sql', 'psql -f "$F"', 'mysql app < big.sql']) expect((await call($, c)).deny).toBeUndefined()
    expect(w.ran).toEqual(['psql -f missing.sql', 'psql -f "$F"', 'mysql app < big.sql'])
    expect(w.fetches.length + w.completes.length).toBe(0)
  })
})
