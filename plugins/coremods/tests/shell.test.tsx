import { describe, expect, test } from 'claude-code/testing'
import { MAX_DEPTH, nestedScript, parse, reparse } from '../hooks/shell/walk'

const argvs = (text: string) => parse(text).commands.map(c => c.argv)

describe('walker: command structure', () => {
  test('lists and pipelines record the stage and the earlier commands', () => {
    const { commands, errors } = parse('a x; b && c || d | e y | f')
    expect(errors).toEqual([])
    expect(commands.map(c => c.argv[0])).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(commands.slice(0, 4).map(c => c.pipeline)).toEqual([null, null, null, expect.anything()])
    const [d, e, f] = commands.slice(3)
    expect([d.pipeline?.stage, e.pipeline?.stage, f.pipeline?.stage]).toEqual([0, 1, 2])
    expect(d.pipeline?.earlier).toEqual([])
    expect(f.pipeline?.earlier.map(c => c.argv[0])).toEqual(['d', 'e'])
  })

  test('subshells and brace groups are walked and keep the stage of the pipeline around them', () => {
    expect(argvs('(a; b) && { c; d; }')).toEqual([['a'], ['b'], ['c'], ['d']])
    const { commands } = parse('curl x | (cat; bash)')
    expect(commands.map(c => c.pipeline?.stage)).toEqual([0, 1, 1])
    expect(commands[2].pipeline?.earlier.map(c => c.argv[0])).toEqual(['curl'])
  })

  test('if, for, while, case and function bodies are walked', () => {
    expect(argvs('if a; then b; elif c; then d; else e; fi')).toEqual([['a'], ['b'], ['c'], ['d'], ['e']])
    expect(argvs('for i in 1 2; do f $i; done')).toEqual([['f', null]])
    expect(argvs('while a; do b; done; until c; do d; done')).toEqual([['a'], ['b'], ['c'], ['d']])
    expect(argvs('case $x in a) b;; c|d) e;; esac')).toEqual([['b'], ['e']])
    expect(argvs('f() { g; h; }; function k { m; }')).toEqual([['g'], ['h'], ['m']])
  })

  test('command substitutions, backticks and process substitutions are walked', () => {
    expect(argvs('echo $(a) `b` <(c) >(d) "$(e)" ${X:-$(f)} $((1 + $(g)))')).toEqual([
      ['echo', null, null, null, null, null, null, null],
      ['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g'],
    ])
    const { commands } = parse('x | echo $(y)')
    expect(commands[2].pipeline).toBeNull()
  })

  test('assignments, redirects and descriptors are reported', () => {
    const [c] = parse('A=1 B=$x cmd -f >out 2>&1 <in &>all {fd}>g').commands
    expect(c.argv).toEqual(['cmd', '-f'])
    expect(c.assigns).toEqual([{ name: 'A', value: '1' }, { name: 'B', value: null }])
    expect(c.redirects).toEqual([
      { op: '>', fd: null, target: 'out' },
      { op: '>&', fd: 2, target: '1' },
      { op: '<', fd: null, target: 'in' },
      { op: '&>', fd: null, target: 'all' },
      { op: '>', fd: 'fd', target: 'g' },
    ])
    expect(parse('echo hi > "$f"').commands[0].redirects[0].target).toBeNull()
    expect(parse('cat <<<"x y"').commands[0].redirects).toEqual([{ op: '<<<', fd: null, target: 'x y' }])
  })

  test('redirects of a compound command apply to the commands inside', () => {
    const { commands } = parse('{ echo a; echo b; } > f 2>&1')
    expect(commands.map(c => c.redirects.map(r => r.target))).toEqual([['f', '1'], ['f', '1']])
    expect(parse('(echo a) > f; echo b').commands[1].redirects).toEqual([])
    expect(parse('echo $(cat) > f').commands[1].redirects).toEqual([])
  })
})

describe('walker: words', () => {
  test('quotes are removed, including r""m and ANSI-C quoting', () => {
    expect(argvs('r""m "a b" \'c d\' e\\ f $\'\\x72m\'')).toEqual([['rm', 'a b', 'c d', 'e f', 'rm']])
  })

  test('~, $HOME and ${HOME} at the start of a word resolve to ~', () => {
    expect(argvs('rm ~ ~/a $HOME $HOME/a ${HOME} "${HOME}/a" "$HOME"')).toEqual([['rm', '~', '~/a', '~', '~/a', '~', '~/a', '~']])
    expect(argvs('echo a$HOME ${HOME:-x} $HOMEX')).toEqual([['echo', null, null, null]])
  })

  test('a word with an expansion is null', () => {
    expect(argvs('echo $x "a${y}b" $(z) `z` $((1)) {a,b} ${x#p}')).toEqual([['echo', null, null, null, null, null, null, null], ['z'], ['z']])
    expect(argvs('export FOO=bar BAZ=$q')).toEqual([['export', 'FOO=bar', null]])
  })
})

describe('walker: heredocs', () => {
  test('a quoted delimiter is reported and its body is not expanded', () => {
    const { commands } = parse("cat <<'EOF' > f\nx $(not run)\nEOF\n")
    expect(commands).toHaveLength(1)
    expect(commands[0].heredocs).toEqual([{ op: '<<', fd: null, body: 'x $(not run)\n', quoted: true }])
    expect(commands[0].redirects).toEqual([{ op: '>', fd: null, target: 'f' }])
  })

  test('an unquoted body is expanded, so its substitutions are walked', () => {
    const { commands } = parse('cat <<EOF\nuser $(whoami) ${X:-`id`}\nEOF\n')
    expect(commands.map(c => c.argv[0])).toEqual(['cat', 'whoami', 'id'])
    expect(commands[0].heredocs[0].quoted).toBe(false)
  })

  test('<<- and a descriptor are reported', () => {
    const [c] = parse('cat 3<<-"E"\n\tbody\n\tE\n').commands
    expect(c.heredocs).toEqual([{ op: '<<-', fd: 3, body: expect.stringContaining('body'), quoted: true }])
  })
})

describe('walker: nested scripts', () => {
  test('nestedScript reads sh, bash, zsh and dash -c, with bundled flags and paths', () => {
    for (const c of ["bash -c 'a b'", "sh -c 'a b'", "zsh -c 'a b'", "dash -c 'a b'", "/bin/bash -lc 'a b'", "bash -ec 'a b'", "bash -o pipefail -c 'a b'", "bash --norc -c 'a b'"]) {
      expect(nestedScript(parse(c).commands[0].argv)).toBe('a b')
    }
  })

  test('nestedScript takes literal eval and nothing else', () => {
    expect(nestedScript(parse('eval a b').commands[0].argv)).toBe('a b')
    expect(nestedScript(parse('eval "rm -rf ~"').commands[0].argv)).toBe('rm -rf ~')
    for (const c of ['eval "$x"', 'eval', 'bash script.sh', 'bash -c "$x"', 'bash', 'bash -x', 'ls -c x', 'sudo bash -c x']) {
      expect(nestedScript(parse(c).commands[0].argv)).toBeNull()
    }
  })

  test('reparse walks the script at the depth it is given', () => {
    const outer = parse("bash -lc 'rm -rf ~; (cd / && ls)'").commands[0]
    expect(outer.depth).toBe(0)
    const inner = reparse(nestedScript(outer.argv)!, outer.depth + 1)
    expect(inner.errors).toEqual([])
    expect(inner.commands.map(c => [c.argv[0], c.depth])).toEqual([['rm', 1], ['cd', 1], ['ls', 1]])
  })

  test('reparse refuses past the depth cap and reports an error', () => {
    expect(reparse('ls', MAX_DEPTH).commands).toHaveLength(1)
    const over = reparse('ls', MAX_DEPTH + 1)
    expect(over.commands).toEqual([])
    expect(over.errors).toHaveLength(1)
  })
})

describe('walker: errors', () => {
  test('a syntax error is reported along with the commands that did parse', () => {
    const { commands, errors } = parse('ls; echo $(fi)')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain("'fi'")
    expect(commands[0].argv).toEqual(['ls'])
    expect(parse('if true; then').errors.length).toBeGreaterThan(0)
    expect(parse('echo "unterminated').errors.length).toBeGreaterThan(0)
  })

  test('deeply nested input is reported, never thrown', () => {
    const n = 2000
    const inputs = [
      'echo $('.repeat(n) + 'x' + ')'.repeat(n),
      'echo "$('.repeat(n) + 'x' + ')"'.repeat(n),
      '{ '.repeat(n) + 'x' + '; }'.repeat(n),
      '( '.repeat(n) + 'x' + ' )'.repeat(n),
      'if a; then '.repeat(n) + 'x' + '; fi'.repeat(n),
      'a | '.repeat(n) + 'x',
      '`'.repeat(n),
    ]
    for (const text of inputs) expect(() => parse(text)).not.toThrow()
    expect(parse(inputs[0]).errors.length).toBeGreaterThan(0)
    expect(parse(inputs[2]).errors.length).toBeGreaterThan(0)
  })
})

describe('walker: timing', () => {
  const unit = 'git commit -m "fix: a $(echo b)" && ls -la src | grep -v node_modules > /dev/null 2>&1; for f in *.ts; do wc -l "$f"; done\n'
  const sample = (bytes: number) => unit.repeat(Math.ceil(bytes / unit.length))
  const median = (text: string, runs: number) => {
    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now()
      parse(text)
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    return times[Math.floor(runs / 2)]
  }

  // Budget from the plan: a typical small command under 2 ms, 40 KB under 100 ms.
  test('1 KB, 4 KB and 40 KB inputs parse within budget', () => {
    for (let i = 0; i < 5; i++) parse(sample(1000))
    const ms = { '1KB': median(sample(1000), 31), '4KB': median(sample(4000), 15), '40KB': median(sample(40000), 7) }
    expect(ms['1KB']).toBeLessThanOrEqual(2)
    expect(ms['4KB']).toBeLessThanOrEqual(10)
    expect(ms['40KB']).toBeLessThanOrEqual(100)
  })
})
