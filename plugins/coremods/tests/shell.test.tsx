import { describe, expect, test } from 'claude-code/testing'
import { MAX_DEPTH, nestedScript, parse, reparse } from '../hooks/shell/walk'

const quotedDeep = (k: number) => 'echo ' + '"${x:-'.repeat(k) + '$(rm -rf /)' + '}"'.repeat(k)

const argvs =(text: string) => parse(text).commands.map(c => c.argv)

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

  test('a pipeline inside a stage keeps the outer stage\'s predecessors upstream', () => {
    for (const text of ['curl x | { cat | bash; }', 'curl x | (cat | bash)']) {
      const bash = parse(text).commands.find(c => c.argv[0] === 'bash')!
      expect(bash.pipeline?.earlier.map(c => c.argv[0])).toEqual(['curl', 'cat'])
      const cat = parse(text).commands.find(c => c.argv[0] === 'cat')!
      expect(cat.pipeline?.earlier.map(c => c.argv[0])).toEqual(['curl'])
    }
    const deep = parse('a | { b | { c | d; }; }').commands
    expect(deep.map(c => c.pipeline?.earlier.map(e => e.argv[0]))).toEqual([[], ['a'], ['a', 'b'], ['a', 'b', 'c']])
  })

  test('ksh -c is a nested script', () => {
    expect(nestedScript(['ksh', '-c', 'rm -rf ~'])).toBe('rm -rf ~')
  })

  test('subs holds the commands inside a command\'s own words and redirects, nested ones included', () => {
    const subs = (text: string) => parse(text).commands.map(c => [c.argv[0], c.subs.map(s => s.argv[0])])
    expect(subs('a $(b $(c)) d; e')).toEqual([['a', ['b', 'c']], ['b', ['c']], ['c', []], ['e', []]])
    expect(subs('bash <(curl x); wget y')).toEqual([['bash', ['curl']], ['curl', []], ['wget', []]])
    expect(subs('bash < <(curl x)')[0]).toEqual(['bash', ['curl']])
    expect(subs('eval $L; curl y')).toEqual([['eval', []], ['curl', []]])
  })

  test('constructs: coproc, time, !, [[ ]], (( )), assignments, arrays and redirect targets', () => {
    expect(argvs('coproc NAME { a; b; }')).toEqual([['a'], ['b']])
    expect(argvs('time a | b')).toEqual([['a'], ['b']])
    expect(argvs('! a && b')).toEqual([['a'], ['b']])
    expect(argvs('[[ $(a) == $(b) && -f x ]] && c')).toEqual([['a'], ['b'], ['c']])
    expect(argvs('(( $(a) + 1 )); for ((i=0; i<$(b); i++)); do c; done').map(a => a[0]).sort()).toEqual(['a', 'b', 'c'])
    expect(argvs('X=$(a) Y=`b` c')).toEqual([['c'], ['a'], ['b']])
    expect(parse('X=$(a) c').commands[0].assigns).toEqual([{ name: 'X', value: null }])
    expect(argvs('arr=($(a) b) c')).toEqual([['c'], ['a']])
    expect(argvs('echo > $(a) 2>>"$(b)" < <(c)')).toEqual([['echo'], ['a'], ['b'], ['c']])
    expect(parse('echo > $(a)').commands[0].redirects).toEqual([{ op: '>', fd: null, target: null }])
  })

  test('assignment subscripts are kept, or null when they expand', () => {
    expect(argvs('declare a[1]=x b+=y')).toEqual([['declare', 'a[1]=x', 'b+=y']])
    expect(argvs('declare a[$i]=safe')).toEqual([['declare', null]])
    expect(parse('a[2]=x b[$i]=y cmd').commands[0].assigns).toEqual([{ name: 'a[2]', value: 'x' }, { name: null, value: 'y' }])
    expect(argvs('x[$(id)]=1 cmd')).toEqual([['cmd'], ['id']])
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
    expect(argvs('echo a$HOME $HOMEX ${HOME#x} ${HOME:+x} ${HOME/a/b}')).toEqual([['echo', null, null, null, null, null]])
    // Operations that keep HOME or only strip its tail still read as home.
    expect(argvs('rm "${HOME:?}" "${HOME:?}/" "${HOME%/}" ${HOME:-x} "${HOME%%/}"')).toEqual([['rm', '~', '~/', '~', '~', '~']])
  })

  test('a quoted or escaped ~ is a file name, not home', () => {
    expect(argvs("rm '~' \"~\" \\~ '~'/x \"~/y\" ~ ~user $'~'")).toEqual([['rm', './~', './~', './~', './~/x', './~/y', '~', '~user', './~']])
    expect(argvs('echo a~ \'a~\'')).toEqual([['echo', 'a~', 'a~']])
  })

  test('$HOME is ~ only as the whole word or before a /', () => {
    expect(argvs('echo "$HOME"x ${HOME}x "${HOME}x" $HOME/x "$HOME/x" $HOME')).toEqual([['echo', null, null, null, '~/x', '~/x', '~']])
  })

  test('an ANSI-C string ends at its first NUL', () => {
    expect(argvs("$'r\\0x'm")).toEqual([['rm']])
  })

  test('glob characters stay literal', () => {
    expect(argvs('rm -rf /* ? [a]')).toEqual([['rm', '-rf', '/*', '?', '[a]']])
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

  test('nestedScript takes the first word after all options, wherever -c sits', () => {
    for (const c of [
      "bash -c -- 'X'", "bash -c -x 'X'", "bash -c -e -- 'X'", "bash -eo pipefail -c 'X'", "bash -euo pipefail -c 'X'",
      "bash -O extglob -c 'X'", "bash +O extglob -c 'X'", "bash +o errexit -c 'X'", "bash --rcfile f -c 'X'",
      "bash --init-file f -c 'X'", "bash -x -c 'X' arg0 arg1", "bash -c 'X' -x", "bash -- -c 'X'",
    ]) {
      const want = c === "bash -- -c 'X'" ? null : 'X'
      expect(nestedScript(parse(c).commands[0].argv)).toBe(want)
    }
    expect(nestedScript(parse('bash -c').commands[0].argv)).toBeNull()
    expect(nestedScript(parse('bash -c -- ').commands[0].argv)).toBeNull()
  })

  test('nestedScript drops a leading -- from eval', () => {
    expect(nestedScript(parse("eval -- 'sudo id'").commands[0].argv)).toBe('sudo id')
    expect(nestedScript(parse('eval --').commands[0].argv)).toBeNull()
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
      quotedDeep(n),
    ]
    expect(() => parse('`'.repeat(n))).not.toThrow()
    // The inner command is either emitted or the parse is reported as failed; never silently dropped.
    for (const text of inputs) {
      expect(() => parse(text)).not.toThrow()
      const r = parse(text)
      expect(r.errors.length > 0 || r.commands.some(c => c.argv[0] === 'x' || c.argv[0] === 'rm')).toBe(true)
    }
    expect(parse(inputs[0]).errors.length).toBeGreaterThan(0)
    expect(parse(inputs[2]).errors.length).toBeGreaterThan(0)
  })

  test('arithmetic nested past the parser stack is an error, not a throw', () => {
    // Whether this overflows depends on the engine's stack, so accept either an error or the parsed command.
    const text = 'echo $((' + '('.repeat(30000) + '1' + ')'.repeat(30000) + '))'
    expect(() => parse(text)).not.toThrow()
    const r = parse(text)
    expect(r.errors.length > 0 || r.commands.some(c => c.argv[0] === 'echo')).toBe(true)
  })

  test('deep quoted nesting past unbash\'s word limit is an error, not a literal', () => {
    for (const k of [10, 255, 257, 300]) {
      const r = parse(quotedDeep(k))
      expect(r.errors.length > 0 || r.commands.some(c => c.argv[0] === 'rm')).toBe(true)
    }
    expect(parse('echo \\$HOME \\`x\\` "\\$y" $').errors).toEqual([])
  })

  test('a lone $ in a plain word is literal bash, not an error', () => {
    for (const c of ['[[ $x =~ ^a$|^b$ ]]', '[[ $x =~ (foo$) ]]', 'echo a$/b', 'echo $% $: $, $. $+ $] $^ $~ $/']) {
      expect(parse(c).errors).toEqual([])
    }
  })

  test('zsh-only $=name is reported with an actionable message', () => {
    const { errors } = parse('echo $=TC')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('rewrite in plain bash')
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

  // The describe body runs while the file loads, so the measured medians can go in the test name.
  // Budget: 1 KB under 5 ms (typical commands are far smaller; corpus p95 is about 0.15 ms), 40 KB under 100 ms.
  for (let i = 0; i < 5; i++) parse(sample(1000))
  const ms = { '1KB': median(sample(1000), 31), '4KB': median(sample(4000), 15), '40KB': median(sample(40000), 7) }
  const label = Object.entries(ms).map(([k, v]) => `${k} ${v.toFixed(2)}ms`).join(', ')
  test(`1 KB, 4 KB and 40 KB inputs parse within budget (median ${label})`, () => {
    expect(ms['1KB']).toBeLessThanOrEqual(5)
    expect(ms['4KB']).toBeLessThanOrEqual(10)
    expect(ms['40KB']).toBeLessThanOrEqual(100)
  })
})
