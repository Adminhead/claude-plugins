import { describe, expect, test } from 'claude-code/testing'
import { analyze } from '../hooks/danger/rules'
import { hygiene } from '../hooks/rules/hygiene'
import type { Verdict } from '../hooks/rules/hygiene'

const verdict = (c: string): Verdict => {
  const { hit, scan } = analyze(c)
  if (hit || !scan) throw new Error(`danger or parse hit for ${c}: ${hit?.rule}`)
  return hygiene(scan.commands)
}

// 'pass', 'unsure', or '<category>/<tool>' for a deny.
const kind = (c: string) => {
  const v = verdict(c)
  return v.kind === 'deny' ? `${v.category}/${v.tool}` : v.kind
}

const expectAll = (cases: string[], want: string) => {
  for (const c of cases) expect([c, kind(c)]).toEqual([c, want])
}

describe('read', () => {
  test('viewing a file goes to Read', () => {
    expectAll(
      [
        'sed -n 1,5p README.md',
        "sed -n '10,20p' src/a.ts",
        "sed -n '/start/,/end/p' f",
        'sed 5q f',
        "sed '1,10!d' f",
        'cat foo.txt',
        'cat -n src/a.ts',
        'head -20 a.ts',
        'head -n 50 a.ts b.ts',
        'tail -n 5 log.txt',
        'tail -n +100 f',
        'less f',
        'more f',
        'nl f',
        'tac f',
        "awk '{print}' f",
        "awk 'NR>=10 && NR<=20' f",
        "awk '/TODO/' f",
        'cat "$f"',
        'head -5 < f',
        'cat f | head -20',
        'cat f | sort',
        'cd src && cat a.ts',
        'bash -c "cat f"',
        'find . -name "*.md" | xargs cat',
      ],
      'read/Read',
    )
  })

  // Claude Code has no Grep or Glob tool; its Bash grep and find are the bundled search tools.
  test('searching contents and finding files stay in the shell', () => {
    expectAll(
      [
        'grep foo file',
        'grep -rn foo src/',
        'grep -r foo',
        'grep -e foo -e bar a b',
        'grep -l foo *.ts',
        'grep -c foo f',
        'egrep "a|b" f',
        'rg foo',
        'rg -n foo src',
        'rg -t ts foo',
        'ag foo',
        'grep foo < f',
        'cat foo | grep x',
        'head -50 f | grep x',
        'grep -rn foo src | head',
        "find . -name '*.ts' | xargs grep foo",
        "find . -name '*.ts' -exec grep -l foo {} +",
        "find . -name '*.ts'",
        "find src -type f -name '*.tsx'",
        "find . -iname 'readme*' -maxdepth 2",
        'find . -type f',
        "find . -path '*/tests/*' -name '*.ts'",
        'fd foo',
        'fd -e ts',
        'rg --files',
        'ls src/*.ts',
        'ls -R',
        "find . -name '*.ts' | head",
      ],
      'pass',
    )
  })

  test('the pass column: filtering output, counting, diffing, data reads that feed a command', () => {
    expectAll(
      [
        'git log | grep x',
        'git log --oneline | head -20',
        'cmd | head',
        'npm test 2>&1 | tail -50',
        'ps aux | grep node',
        'docker logs x | grep error',
        'wc -l f',
        'diff a b',
        'git diff',
        'git show HEAD:x',
        'git show HEAD~1 --stat',
        'jq .a f.json',
        'cat f | jq .',
        'cat f | wc -l',
        'cat f.sql | psql db',
        'curl -s x | jq .',
        'nvm use $(cat .nvmrc)',
        'kill $(cat app.pid)',
        'cat a b > c',
        'cat f >> g',
        'head -c 100 /dev/urandom | base64',
        'cat /proc/cpuinfo',
        'tail -f log.txt',
        'tail -F log.txt',
        'grep -q foo f && echo y',
        'if grep -qs foo f; then echo y; fi',
        'cat <<EOF\nhello\nEOF',
        'ls',
        'ls -la src',
        'ls -d */',
        'find . -type d',
        'find . -name x -delete',
        "find . -name '*.pyc' -exec rm {} +",
        "find . -name '*.ts' | wc -l",
        "find . -name '*.ts' | xargs rm",
        'find . -mtime -1',
        'git log | sed -n 1,3p',
        'echo hi | grep h',
        'grep foo <<< "$x"',
        'rg foo <<< "$x"',
        'while read l; do echo "$l"; done < f',
        'cat -A f',
        'stat f',
        'file f',
        'tree src',
        'xxd f | head',
        'strings bin | grep x',
      ],
      'pass',
    )
  })

  test('shapes the parser cannot settle go to the model', () => {
    expectAll(["awk '{s+=$1} END {print s}' f", "sed 's/a/b/' f", 'cat f | tr a b', 'cat f | mytool'], 'unsure')
  })
})

describe('write', () => {
  test('authored text into a file goes to Write', () => {
    expectAll(
      [
        'cat > /tmp/x <<EOF\nhello\nEOF',
        "cat <<'EOF' > src/a.ts\nexport const a = 1\nEOF",
        'cat >> f <<EOF\nmore\nEOF',
        'echo "node_modules" >> .gitignore',
        "echo 'export X=1' > .env",
        'printf "%s\\n" a b > list.txt',
        'printf "hello\\n" > f',
        '{ echo a; echo b; } > f',
        'echo hi | tee f',
        'echo hi | tee -a f',
        'cat <<EOF | tee f\nx\nEOF',
        'tee f <<EOF\nx\nEOF',
        'tee f <<< "text"',
        "python3 -c \"open('x','w').write('hi')\"",
        "python -c \"import pathlib; pathlib.Path('x').write_text('y')\"",
        "node -e \"require('fs').writeFileSync('x','y')\"",
        "ruby -e 'File.write(\"x\", 1)'",
        "perl -e 'open(my $f, \">\", \"x\"); print $f 1'",
      ],
      'write/Write',
    )
  })

  test('in-place edits go to Edit', () => {
    expectAll(
      [
        "sed -i 's/a/b/' f",
        "sed -i.bak 's/a/b/g' f",
        "sed -i '' 's/a/b/' f",
        "sed --in-place -e 's/a/b/' f",
        "perl -pi -e 's/a/b/' f",
        "perl -i.bak -pe 's/a/b/' f",
        "find . -name '*.ts' -exec sed -i s/a/b/ {} +",
        "grep -l foo -r . | xargs sed -i s/foo/bar/",
        "awk -i inplace '{print}' f",
      ],
      'write/Edit',
    )
  })

  test('the pass column: captured output, sinks, heredocs to a program, copies', () => {
    expectAll(
      [
        'npm test > out.log',
        'npm test > out.log 2>&1',
        'cmd 2>&1 | tee build.log',
        'make | tee -a make.log',
        'echo hi > /dev/null',
        'echo hi >&2',
        'echo hi',
        'date > stamp',
        'git diff > patch.diff',
        'cp a b',
        'mv a b',
        'echo "" > f',
        ': > f',
        'git commit -F - <<EOF\nmsg cat foo > x\nEOF',
        'kubectl apply -f - <<EOF\nkind: Pod\nEOF',
        'psql <<EOF\nselect 1;\nEOF',
        "git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\"",
        "gh pr create --body \"$(cat <<'EOF'\nbody\nEOF\n)\"",
        "python -c 'import sys; print(sys.version)'",
        "python3 -m http.server 8000",
        "node -e 'console.log(process.version)'",
        'base64 -d key.b64 > key.pem',
        'jq .a f.json > out.json',
      ],
      'pass',
    )
  })

  test('shapes the parser cannot settle go to the model', () => {
    expectAll(['echo "$PID" > /tmp/pid', "python3 - <<'EOF'\nimport shutil; shutil.copy('a','b')\nEOF", "python3 -c \"print(open('f').read())\""], 'unsure')
  })

  // B1: a script on stdin that writes authored content is a write, Edit when it also reads the file it changes.
  test('scripts on stdin that write files are denied', () => {
    expectAll(
      [
        "python3 - <<'EOF'\np='src/Vm.cs'; s=open(p).read(); s=s.replace('a','b'); open(p,'w').write(s)\nEOF",
        "python3 -I - <<'EOF'\np='src/Vm.cs'; s=open(p).read(); s=s.replace('a','b'); open(p,'w').write(s)\nEOF",
      ],
      'write/Edit',
    )
    expectAll(
      [
        "python3 - <<'EOF'\nimport pathlib\npathlib.Path('docs/x.md').write_text('hi')\nEOF",
        "cd x && python3 - <<'EOF'\nwith open(\"db/migrations/x.sql\",\"w\") as f:\n    f.write(s)\nEOF",
        "python3 - <<'EOF'\nopen(\"/tmp/claude-1000/x/scratchpad/pr-patch.json\",\"w\").write(\"{}\")\nEOF",
      ],
      'write/Write',
    )
    const v = verdict("python3 - <<'EOF'\nopen('o','w').write('x')\nEOF")
    expect(v.kind === 'deny' ? v.message : '').toMatch(/save it with the Write tool and run it as a file/)
  })

  const py = (body: string) => `python3 - <<'EOF'\n${body}\nEOF`

  test('read-only scripts that mention a mode-like string, or write code in a string, are not denied', () => {
    expectAll(
      [
        "print(open('a.txt').read().replace('x', 'abc'))",
        "print(sum(1 for l in open('a.csv') if 'a' in l), 'wow')",
        "print(open('a').read(), 'w')",
        "print(f(open('a'), 'wrap'))",
      ].map(py),
      'pass',
    )
  })

  // Blanking a string never leads to pass: a write mentioned in a string is at best unsure, and executed strings are never silent.
  test('write code in a string is unsure, and executed or stray-quoted strings are never a pass', () => {
    expectAll(['print("f.write_text(s)")', `print("would call open(p, 'w')")`].map(py), 'unsure')
    const bodies = [
      `exec("open('o','w').write('x')")`,
      `eval("open('o','w').write('x')")`,
      `exec(compile("open('o','w').write('x')",'f','exec'))`,
      `s="open('o','w').write('x')"; exec(s)`,
      `import subprocess\nsubprocess.run("echo x > f", shell=True)`,
      `new Function("require('fs').writeFileSync('x','y')")()`,
      `eval("require('fs').writeFileSync('x','y')")`,
      `vm.runInThisContext("require('fs').writeFileSync('x','y')")`,
      `vm.runInNewContext("require('fs').writeFileSync('x','y')")`,
      `setTimeout("require('fs').writeFileSync('x','y')")`,
    ]
    const inlines = [
      ...bodies.map(b => `python3 -c ${JSON.stringify(b)}`),
      ...bodies.map(b => `node -e ${JSON.stringify(b)}`),
      ...bodies.map(b => `node <<'EOF'\n${b}\nEOF`),
      ...bodies.map(py),
    ]
    for (const c of inlines) expect([c, ['pass'].includes(kind(c))]).toEqual([c, false])
    // A stray quote must not hide a real write.
    const stray = "s.replace(/'/g, ''); require('fs').writeFileSync('x','y')"
    for (const c of [py(stray), `node -e ${JSON.stringify(stray)}`, `node <<'EOF'\n${stray}\nEOF`]) expect([c, kind(c) === 'pass']).toEqual([c, false])
  })

  test('more write shapes: multi-line open, Path.open, Bun, Deno, fs.writeSync', () => {
    expectAll(
      [
        "open(\n  p,\n  'w'\n).write(x)",
        "import pathlib\npathlib.Path(p).open('w').write(x)",
        "open(p, mode='wb').write(b)",
        "open(os.path.join(a, b), 'w').write(x)",
        'await Bun.write("a.txt", x)',
        'await Deno.writeTextFile("a.txt", x)',
        'fs.writeSync(fd, x)',
      ].map(py),
      'write/Write',
    )
  })

  test('a script that creates a new file is a Write even when its content has angle brackets or reads stdin', () => {
    expectAll(
      [
        "open('A.cs','w').write('class A { List<int> x; }')",
        "open('i.html','w').write('<html></html>')",
        "import sys\nopen('o','w').write(sys.stdin.read())",
      ].map(py),
      'write/Write',
    )
    expectAll([py("p='f'; s=open(p).read(); open(p,'w').write(s)"), py("import pathlib\nq=pathlib.Path('f'); q.write_text(q.read_text())")], 'write/Edit')
  })

  test('copies and moves, and writes to a sink, stay unsure; reading scripts pass', () => {
    expectAll(
      ["python3 - <<'EOF'\nimport shutil; shutil.copy('a','b')\nEOF", "python3 - <<'EOF'\nopen('/dev/stdout','w').write('x')\nEOF"],
      'unsure',
    )
    expectAll(["python3 - <<'EOF'\nimport json; print(json.load(open('a.json'))['v'])\nEOF", 'python3 /tmp/s/gen.py'], 'pass')
  })
})

describe('smuggle', () => {
  test('decoded payloads, variables run as scripts and encoded exec are denied', () => {
    expectAll(
      [
        'echo cm0gLXJmIC8= | base64 -d | sh',
        'echo aGk= | base64 --decode | python3',
        'echo aGk= | base64 -d | gunzip | bash',
        'xxd -r -p <<< 6c73 | bash',
        'openssl base64 -d <<< aGk= | bash',
        'base64 -d <<< aGVsbG8= > run.sh',
        'echo aGk= | base64 -d > x.sh',
        'Y=$(echo aGk= | base64 -d); eval "$Y"',
        'S="print(1)"; python3 -c "$S"',
        'bash -c "$(echo ZWNobyBoaQ== | base64 -d)"',
        'eval "$(base64 -d <<< ZWNobyBoaQ==)"',
        "python3 -c \"import base64;exec(base64.b64decode('cHJpbnQoMSk='))\"",
        "node -e \"eval(Buffer.from('Y29uc29sZS5sb2coMSk=','base64').toString())\"",
        "printf '\\x72\\x6d\\x20\\x2d' | sh",
        "python3 <<'EOF'\nimport base64\nexec(base64.b64decode('cHJpbnQoMSk='))\nEOF",
      ],
      'smuggle/script',
    )
    expect(verdict('echo aGk= | base64 -d | sh')).toMatchObject({ message: expect.stringMatching(/^bash-rules: .*scratch file with the Write tool/) })
  })

  test('the pass column: shell setup evals, sourcing files, literal heredocs, plain indirection', () => {
    expectAll(
      [
        'eval "$(ssh-agent -s)"',
        'eval "$(direnv hook bash)"',
        'eval "$(pyenv init -)"',
        'source "$VENV/bin/activate"',
        '. "$NVM_DIR/nvm.sh"',
        'bash "$script"',
        'bash <<EOF\necho hi\nEOF',
        'bash -c "echo hi"',
        'PY=python3; $PY -m pytest',
        'base64 f',
        'echo aGk= | base64 -d',
        'eval echo hi',
      ],
      'pass',
    )
  })

  test('shapes the parser cannot settle go to the model', () => {
    expectAll(['echo ls | sh', 'bash -c "$CMD"', 'eval "$(cat x)"', 'python3 -c "exec(input())"'], 'unsure')
  })
})

// B3: a variable assigned plain words is written into the command before the checks, so the rules see what runs.
describe('literal variables', () => {
  test('literal and path-finder variables run as commands pass', () => {
    expectAll(
      [
        'cd w; H="dotnet run --no-build --project src/Tools.Headless -- --content content"; $H --scenario content/scenarios/smoke.json --ticks 1200',
        'H="dotnet run --no-build --project src/Tools.Headless --" && $H --content content',
        'S=/tmp/claude-1000/x/scratchpad/setstatus.sh; bash $S 153 "In review"',
        'C="kubectl --context omni-dev"; $C get ns',
        'P="kubectl --context omni-dev -n isktel-dev exec isktel-db-1 -c postgres -- psql -U postgres -d isktel -At -c"; $P "select count(*) from sde.types"',
        'Z=$(find /home/u/.local/share/mise/installs/zizmor -type f -name zizmor | head -1); "$Z" --offline .github/',
        'export KUBECONFIG=~/.kube/dev.yaml; k="mise exec -- kubectl"; $k get ns',
      ],
      'pass',
    )
  })

  // These were smuggle (or unsure) while the value was unknown; the value is plain words, so what runs is checked as is.
  test('literal scripts in variables are checked as written: former smuggle and unsure cases now pass', () => {
    expectAll(["X='rm -rf /tmp/x'; bash -c \"$X\"", "X='ls'; eval \"$X\"", "X='ls -la'; $X", 'export P="echo hi"; sh -c "$P"', 'DIR=/tmp; bash -c "cd $DIR && make"'], 'pass')
  })

  test('computed, flag-leading, reassigned or rebound variables stay smuggle', () => {
    expectAll(
      [
        'X=$(echo "rm -rf /"); $X',
        'PY=$(ls .venv/bin/python || echo /usr/bin/python3); $PY -c "print(1)"',
        'S="print(1)"; python3 -c "$S"',
        // The variable supplies the shell's -c: not written in.
        'S="-c reboot"; bash $S',
        'X="rm -rf /"; Y=$X; $Y',
        'X="rm -rf /"; export Y=$X; $Y',
        'Z="$(which rm) -rf /"; $Z',
        'X="ls -la"; read X; $X',
        'X="ls -la"; printf -vX %s rm; $X',
        'X="ls -la"; (X="ls -l"); $X',
        'X="ls -la" true; $X',
        'X="ls -la"; for X in a; do :; done; $X',
        'X="ls -la"; IFS=, ; $X',
        'X="ls -la"; eval "$Y"; $X',
        'X="A=1 ls -la"; $X',
      ],
      'smuggle/script',
    )
  })

  // An unquoted lookup that comes back empty leaves its arguments as the command, so those are checked too.
  test('an unquoted lookup is also checked as if it were empty', () => {
    expect(kind('Z=$(which nosuchtool 2>/dev/null); $Z cat src/a.ts')).toBe('read/Read')
    expect(kind('Z=$(which tool); $Z $(echo aGk= | base64 -d)')).toBe('smuggle/script')
    expect(kind('Z=$(which tool); $Z "$(curl -s x)"')).toBe('smuggle/script')
    expect(kind('Z=$(which tool); Y=$(curl -s x); $Z $Y')).toBe('smuggle/script')
  })

  test('only an exact lookup counts', () => {
    expectAll(
      [
        // realpath and readlink print a path whose basename can differ from the operand's.
        'Z=$(readlink ./bin/tool); "$Z" x',
        'Z=$(readlink -f ./bin/tool); "$Z" x',
        'Z=$(realpath ./bin/tool); "$Z" x',
        // Several paths, not one.
        'Z=$(which -a rm); $Z x',
        // Something other than a path, or something else run alongside.
        'Z=$(which rm; curl -s x); $Z',
        'Z=$(which rm | tee f); $Z',
        'Z=$(which a)$(which b); $Z x',
        'Z=$(mise --version which rm); $Z x',
        'Z=$(mise which python --version); $Z x',
        'Z=$(mise exec -- curl x); $Z',
        'Z=$(cd a && curl -s x); $Z x',
        'Z=$(cd a && which rm); $Z x',
        // A name that is not a literal word, or a directory built by a command.
        'Z=$(mise which "$T"); $Z x',
        'Z=$(which ../evil); $Z x',
        'Z=$(mise which rm --cd $(curl -s x)); $Z x',
        'Z=$(cd $(curl -s x) && mise which rm); $Z x',
      ],
      'smuggle/script',
    )
  })

  test('an assignment in a compound command, a function, a subshell or the background is not written in', () => {
    expectAll(
      [
        'X="echo hi" & $X rm -rf ~',
        'if false; then X="echo hi"; fi; $X rm -rf ~',
        'f() { X="echo hi"; }; $X rm -rf ~',
        'case a in b) X="echo hi";; esac; $X rm -rf ~',
        '{ X="echo hi"; }; $X ls',
        'time -p if false; then X="echo hi"; fi; $X rm -rf ~',
        'time if false; then X="echo hi"; fi; $X rm -rf ~',
        'function f {\nX="echo hi"\n}\n$X rm -rf ~',
        'if false; then case a in b) :;; fi) :;; esac; X="echo hi"; fi; $X rm -rf ~',
        'select v in a; do X="echo hi"; break; done; $X rm -rf ~',
        'until true; do X="echo hi"; done; $X rm -rf ~',
      ],
      'smuggle/script',
    )
  })

  // A compound command around the use changes nothing: the value is set by then, and `$X rm -rf ~` only echoes.
  test('a settled variable is written in past any compound command', () => {
    expectAll(['X="echo hi"; (true); $X rm -rf ~', 'X="echo hi"; [[ -n x ]]; $X rm -rf ~', 'X="echo hi"; ! true; $X rm -rf ~'], 'pass')
  })

  // After `&&` or `||` the assignment may not run, so the command is checked both ways: with the value and without it.
  test('an assignment that may not run passes when both outcomes do', () => {
    expectAll(
      [
        'cd w && H="dotnet run --no-build --project src/Tools.Headless -- --content content"; $H --scenario content/scenarios/smoke.json',
        'cd /tmp/w && A=/opt/atlas/atlas; $A migrate apply --env local; $A migrate hash',
        'cd /tmp/w && Y="mise x yq@4.54.1 -- yq"; for e in dev prod; do kubectl kustomize $e | $Y -N .kind; done',
        'cd /tmp/w && S=$(mise which sqlc); "$S" generate -f a.yaml',
        'false || X="echo hi"; $X ls',
        // In an all-`&&` list what follows runs only after the assignment.
        'cd w && D=/tmp/x && rm -rf "$D/"',
      ],
      'pass',
    )
    expectAll(['false && X="echo hi"; $X cat src/a.ts', 'cd w && F=src/a.ts; $F cat src/b.ts'], 'read/Read')
  })

  test("a quoted heredoc body is literal: its $X is not written in", () => {
    expectAll(['X="echo hi"\nbash <<\'EOF\'\n$X rm -rf ~\nEOF', 'X="echo hi"\nbash <<\'EOF\'\n$X cat src/a.ts\nEOF'], 'smuggle/script')
    // Unquoted, the outer shell writes it in before the inner one runs.
    expect(kind('X="echo hi"\nbash <<EOF\n$X ls\nEOF')).toBe('pass')
    // Keywords in quoted text and heredoc bodies are data: expansion stays on.
    expectAll(['echo "if then"; X="ls -la"; $X', "cat <<'EOF'\nif done\nEOF\nX=\"ls -la\"; $X", 'X="ls -la"; diff <(echo a) b; $X'], 'pass')
  })

  test('IFS set by a binder, computed declarations and wrapped source turn expansion off', () => {
    expectAll(
      [
        'X="echo,a b"; printf -v IFS ,; $X',
        'X="echo,a b"; read IFS <<< ,; $X',
        'X="echo,a b"; for IFS in ,; do :; done; $X',
        'X="ls -la"; declare -n N="$(printf %b \\\\x58)"; N="rm -rf ~"; $X',
        'X="ls -la"; builtin source ./f; $X',
        'X="ls -la"; command . ./f; $X',
      ],
      'smuggle/script',
    )
  })

  test('variables a compound command, a nested script or a lookup can settle pass', () => {
    expectAll(
      [
        // Tool lookups.
        'S=$(mise --cd /home/u/mgmt which sops); $S set infra/a.yaml \'["k"]\' \'"v"\' && echo set',
        'S=$(mise -C /home/u/mgmt which sops); "$S" encrypt a.yaml',
        'S=$(mise --cd "$W" which sops); $S decrypt a.yaml',
        'GC=$(mise which git-cliff --cd /home/u/backend); $GC --tag-pattern x',
        'Y=$(mise which yq); echo $Y; for e in dev prod; do $Y -N .kind /tmp/$e.out; done; $Y . /tmp/a',
        'PY=$(cd $W && mise which python); cd /tmp/x; $PY script.py',
        'TOFU=$(cd $W && mise which tofu); timeout 120 $TOFU init -backend=false',
        'Z=$(which yq); $Z . f',
        'Z=$(command -v yq); $Z . f',
        'Z=`which yq`; $Z . f',
        'export Z=$(mise which yq); $Z . f',
        'A=$(find ~/.espressif -name riscv32-esp-elf-addr2line -type f | head -1); $A -f -e fw.elf',
        // Running a file, or the interpreter's own module, is not a hidden script.
        'PY=$(mise which python); $PY script.py',
        'PY=$(mise which python); $PY -m pytest',
        "PY=$(mise which python); $PY -I - <<'EOF'\nprint(1)\nEOF",
        'S=$(which bash); $S script.sh',
        // Literal paths and command prefixes, used in compound commands and functions.
        'V=/abs/path/scripts/validate.sh; $V',
        'B=/tmp/r; V=/abs/path/scripts/validate.sh\nfor d in a b; do out=$(bash $V $B/$d 2>&1); echo "$out"; done\nbash $V $B/new',
        'X="mise x yq@4.54.1 kubeconform@0.8.0 --"; for k in a b; do $X yq . $k.yaml > $k.json; done; $X kubeconform -strict data/*.yaml',
        'B="git -C ../backend show 890c1b3:" && for f in lib pr; do $B scripts/$f.sh > scripts/$f.sh || $B"scripts/$f.sh" > scripts/$f.sh; done',
        'T="timeout 25 mise exec -- kubectl"; if $T get ns; then $T get pods; fi',
        'G="git -c user.name=t -c user.email=t@t"; c() { $G commit -q --allow-empty -m "$1"; }; c one',
        'E="env -u KUBECONFIG"; $E mise exec -- tofu plan',
        'P="psql -h 127.0.0.1 -d app"; PGPASSWORD=x $P -At -c "select 1"',
        'Q=~/bin/q; $Q -f x',
        'Q=$HOME/bin/q; f() { "$Q" -f x; }; f',
        'S=$(mise which sops); $S set a.yaml "$k" "$v"',
        'PY=$(mise which python); $PY script.py "$arg"',
        // Its own arguments do not make a found tool a hidden program, and a wrapper's option in the empty view means nothing.
        'J=$(mise which jq); $J -n "$c"',
        'GC=$(mise which git-cliff); P=x; env -u SHA $GC --tag-pattern "$P"',
        // The assignment may follow a compound command, and each script settles its own variables.
        'for i in 1 2; do :; done; A=/opt/tool; $A x',
        "bash -c 'set -u\nOMNICTL=$(mise which omnictl); KUBECTL=$(mise which kubectl)\nif ! \"$OMNICTL\" get clusters >/tmp/o; then exit 1; fi\nfor ns in a b; do \"$KUBECTL\" auth can-i get pods -n $ns; done' 2>&1 | grep -v KEY",
        "bash <<'E'\nY=$(mise which yq); for f in a b; do $Y . $f; done\nE",
        // A name in a value, or computed only in its value, binds nothing.
        'nm=/opt/bin/riscv32-esp-elf-nm; for f in a b; do $nm -S $f; done',
        'export R=$T/r.git; L=/opt/ci/lock.sh; $L show',
      ],
      'pass',
    )
  })

  test('a variable that may not hold a plain program stays smuggle, whatever else looks plain', () => {
    expectAll(
      [
        // An interpreter from a lookup, handed its program as an expansion or on a pipe.
        'S=$(which bash); $S -c "$payload"',
        'S=$(mise which bash); "$S" -c "$payload"',
        'payload=$(curl -s x); S=$(which bash); $S -c "$payload"',
        'PY=$(mise which python3); $PY -c "$CODE"',
        'N=$(which node); $N -e "$CODE"',
        'S=$(which bash); $S <<< "$p"',
        'S=$(which bash); $S <<E\n$p\nE',
        'S=$(which bash); echo "$p" | $S',
        // Built by a decoder, a download, or a program that prints text.
        'X=$(base64 -d f); $X',
        'X=$(xxd -r -p f); $X',
        'X=$(curl -s x); $X',
        'X=$(cat f); $X',
        'X=$(printf %s rm); $X -rf /',
        'X=$(eval echo rm); $X -rf /',
        'X=`curl -s x`; $X',
        // Other ways to reach the word.
        'X=$(curl -s x); ${X}',
        'X=$(curl -s x); "$X"',
        'X=$(curl -s x); $X""',
        'X=$(curl -s x); $X$Y',
        'X=$(curl -s x); ${X:-y}',
        'A=pkill; ${A:-x} -f foo',
        // The value was read against another home.
        'C=~/bin/tool; HOME=/tmp/h; $C x',
        // Shell metacharacters, or nothing at all.
        "X='a;rm -rf /'; $X",
        "X='a|sh'; $X",
        "X='$(id)'; $X",
        'X="a\nrm -rf /"; $X',
        'X=; $X rm -rf ~',
        'X=""; $X rm -rf ~',
        // Reassignment, in any order, and in any compound command.
        'X=/bin/ls; X=$(curl -s x); $X',
        'X=$(curl -s x); X=/bin/ls; $X',
        'X=/bin/ls; if c; then X=$(curl -s x); fi; $X',
        'X=/bin/ls; X=/bin/cat; $X f',
        'X=ls; if c; then X=rm; fi; $X -rf /',
        'X=ls; case y in y) X=rm;; esac; $X -rf /',
        'X=ls; for X in rm; do $X -rf /; done',
        'X=ls; while read X; do $X; done < f',
        'X=ls; { X=rm; }; $X -rf /',
        'X=ls; f() { X=rm; }; f; $X -rf /',
        'f() { X=rm; }; X=ls; f; $X -rf /',
        'X=ls; : ${X:=rm}; $X -rf /',
        'X=ls; Y=$((X=5)); $X -rf /',
        'X=ls; unset X; $X rm -rf ~',
        'X=ls; trap "X=rm" DEBUG; $X -rf /',
        'X=ls; declare -g X=rm; $X -rf /',
        'X=ls; eval "X=rm"; $X -rf /',
        'X=ls; . ./f; $X',
        // A single word no longer hides behind a compound command, a function, a nested script or an unknown value.
        'if c; then X=pkill; fi; $X -f foo',
        'f() { $X -f foo; }; X=pkill; f',
        "X=pkill bash -c '$X -f foo'",
        "export X=pkill; bash -c '$X -f foo'",
        'read -r X < f; $X -f foo',
        'read -ra X < f; $X -f foo',
        'mapfile -t X < f; $X -f foo',
        'printf -v X %s pkill; $X -f foo',
        "sh -c 'X=$(curl -s x); $X'",
        // Copied through more assignments than are followed, or from a lookup.
        'X=rm; Y=$X; Z=$Y; W=$Z; V=$W; $V -rf /',
        'Z=$(which rm); Y=$Z; $Y -rf /',
      ],
      'smuggle/script',
    )
  })

  // Review of the second cut. Each of these passed there, and bash can run something the rules did not see.
  test('a value must be one substitution, whole', () => {
    expectAll(
      [
        'Z="$(which nosuch)pkill -f foo )"; $Z',
        'Z=$(which nosuch)\\ pkill\\ -f\\ foo\\ \\); $Z',
        'Z="$(which nosuch)sudo ls )"; $Z',
        'Z="$(which yq)x)"; $Z',
        'Z="$(which yq)$(curl x)"; $Z',
        'P=$(curl x); Z="$(which nosuch)$P )"; $Z',
      ],
      'smuggle/script',
    )
  })

  test('the word after a variable that may hold nothing must be known', () => {
    const shapes = [
      'Z=$(which a); Y=$(which b); $Z $Y pkill -f foo',
      'Z=$(which a); Y=$(which b); $Z $Y sudo ls',
      'Z=$(which a); Y=$(which b); V=$(which c); $Z $Y $V pkill -f foo',
      'Z=$(which nosuch); Y=$(which rm); $Z $Y -rf /',
      'Z=$(which a); Y=$(which b); $Z $Y $(curl x)',
      'Z=$(which a); Y=$(which b); P=$(curl x); $Z $Y $P',
      'Z=$(which a); false && X=b; $Z $X pkill -f foo',
      'false && X=a; false && Y=b; $X $Y pkill -f foo',
      'PY=$(mise which python); $PY "$f"',
      'Z=$(which a); $Z "$p"',
    ]
    expectAll([...shapes, ...shapes.slice(0, 7).map(c => `bash -c '${c}'`)], 'smuggle/script')
  })

  test('a lookup is not written in when the text can change what it prints', () => {
    expectAll(
      [
        'which() { echo pkill; }; Z=$(which yq); $Z -f foo',
        'function which { echo pkill; }; Z=$(which yq); $Z -f foo',
        'which() { echo pkill; }\nZ=$(which yq); $Z -f foo',
        'mise() { echo pkill; }; Z=$(mise which yq); $Z -f foo',
        'command() { echo pkill; }; Z=$(command -v yq); $Z -f foo',
        'type() { echo pkill; }; Z=$(type -P yq); $Z -f foo',
        'find() { echo pkill; }; Z=$(find . -name yq); $Z -f foo',
        'head() { echo pkill; }; Z=$(which yq | head -1); $Z -f foo',
        'cd() { :; }; mise() { echo pkill; }; Z=$(cd /x && mise which yq); $Z -f foo',
        "eval 'which() { echo pkill; }'; Z=$(which yq); $Z -f foo",
        "which() { echo pkill; }; export -f which; bash -c 'Z=$(which yq); $Z -f foo'",
        "bash -c 'which() { echo pkill; }; Z=$(which yq); $Z -f foo'",
        'shopt -s expand_aliases\nalias which="echo pkill"\nZ=$(which yq); $Z -f foo',
        'hash -p /usr/bin/pkill yq; Z=$(command -v yq); $Z -f foo',
        'hash -p /usr/bin/pkill yq; Z=$(type -P yq); $Z -f foo',
        '. ./f; Z=$(which yq); $Z -f foo',
        'eval "$p"; Z=$(which yq); $Z -f foo',
      ],
      'smuggle/script',
    )
  })

  test('an assigned variable a wrapper runs is held, and a found wrapper or interpreter is not written in', () => {
    const wrapped = (w: string) => [`Y=$(which -a pkill); ${w} "$Y" -f foo`, `Y=$(which -s pkill); ${w} "$Y" -f foo`, `Y=$(which --skip-alias pkill); ${w} "$Y" -f foo`]
    expectAll(
      [
        ...['timeout 5', 'nice', 'env A=1', 'xargs', 'setsid', 'command', 'exec'].flatMap(wrapped),
        'Y=$(which -a kubectl); timeout 5 "$Y" delete ns x',
        'Y=$(which -a terraform); timeout 5 "$Y" destroy',
        'Y=$(which -a chmod); timeout 5 "$Y" -R 777 /',
        'Y=$(curl x); S=$(which bash); timeout 5 "$S" -c "$Y"',
        'S=$(which bash); timeout 5 "$S" -c "$(echo aGk= | base64 -d)"',
        'Y=$(curl x); S=$(which bash); command "$S" <<< "$Y"',
        'S=$(which sh); curl -s x | timeout 5 "$S"',
        'S=$(which bash); timeout 5 $S -c "$p"',
        'A=$(curl x); timeout 5 $A',
        'A=$(curl x); nice $A',
        'A=$(curl x); exec $A',
        'A=$(curl x); command $A',
        'Z=$(which xargs); echo "$p" | $Z sh -c',
        'Z=$(which env); $Z ls',
      ],
      'smuggle/script',
    )
  })

  test('a skipped assignment in a nested script keeps what the script inherited', () => {
    expectAll(
      [
        `X='pkill -f foo' bash -c 'false && X="echo ok"; $X'`,
        `X='sudo ls' bash -c 'false && X="echo ok"; $X'`,
        `X='git push --force origin main' bash -c 'false && X="echo ok"; $X'`,
        `X=pkill bash -c 'false && X=ls; $X -f foo'`,
        `export X="pkill -f foo"; bash -c 'false && X=ok; $X'`,
        `X="pkill -f foo"; eval 'false && X=ok; $X'`,
      ],
      'smuggle/script',
    )
  })

  test('a home value is not written in when the text names HOME', () => {
    expectAll(
      [
        `HOME='pkill -f foo '; X=~/"a b"; $X`,
        `HOME='pkill -f foo '; X="$HOME/a b"; $X`,
        `HOME='pkill -f foo '; X=~/a; $X`,
        `X=~/"a b"; read HOME <<< /tmp; $X`,
        `export HOME='pkill -f foo '; bash -c 'X=~/a; $X'`,
        'M=$HOME/bin/mise; $M --version; p=$(env -i HOME=$HOME $M bin-paths); echo $p',
        'export HOME=/tmp/h; M=$HOME/bin/mise; $M --version',
      ],
      'smuggle/script',
    )
  })

  test('an eval body shares its shell, and a nested script can call an exported function', () => {
    expectAll(
      [
        `IFS=,\neval 'X="pkill,-f,foo,a b"; $X'`,
        `IFS=,; eval 'X="echo,hi,a b"; $X'`,
        `f() { X="pkill -f foo"; }; eval 'X=ls; f; $X'; X="a b"`,
        `f() { X=pkill; }; eval 'X=ls; f; $X -f foo'`,
        `eval 'R=pkill; $R -f foo'`,
        `f() { X="pkill -f foo"; }; export -f f; bash -c 'X=ls; f; $X'`,
        'IFS=,; X="pkill,-f,foo,a b"; $X',
        // An assignment built only once its parts are written in.
        'A=I; B=FS=,; eval "$A$B"; X="pkill,-f,foo,a b"; $X',
        // Word splitting in a redirect differs, so this one is not written in.
        'X="pkill -f foo"; (true); sh <<< $X',
      ],
      'smuggle/script',
    )
  })

  test('a filter must keep whole lines', () => {
    expectAll(['Z=$(which pkillx | head -c 14); $Z -f foo', 'Z=$(which xpkill | tail -c 6); $Z -f foo', 'Z=$(which xpkill | tail -c 6); "$Z" -f foo', 'Z=$(which xpkill | sort -of); $Z'], 'smuggle/script')
    expectAll(['Z=$(which yq | head -1); $Z . f', 'Z=$(which yq | head -n 1); $Z . f', 'Z=$(which yq | tail -n1); $Z . f', 'Z=$(find . -name yq | sort -V | tail -1); $Z . f'], 'pass')
  })

  test('forms invocation cannot read stay unwritten', () => {
    expectAll(
      [
        'Y=$(curl x); PY=$(which python3); $PY -c"$Y"',
        'Y=$(curl x); N=$(which node); $N --eval="$Y"',
        'Y=$(curl x); S=$(which bash); $S /dev/fd/0 <<< "$Y"',
        'Y=$(curl x); W=$(which timeout); $W 5 $Y',
        'W=$(which timeout); S=$(which bash); $W 5 $S -c "$p"',
        'Y=$(curl x); Z=$(which node); $Z -c "$Y"',
        'L=$(which lua); $L -e "$c"',
        'A=$(which awk); $A "$c" f',
        'S=$(which sed); $S -e "$c" f',
        'B=$(which busybox); $B sh -c "$p"',
        'D=$(which deno); $D eval "$c"',
      ],
      'smuggle/script',
    )
    expect(kind('Y=$(curl x); bash /dev/fd/0 <<< "$Y"')).toBe('smuggle/script')
  })

  test('without its variable the arguments must not hide an interpreter either', () => {
    expectAll(['Z=$(which x); $Z bash -c "$p"', 'Z=$(which x); $Z bash -c "$(curl x)"', 'cd w && X=/opt/t; $X env bash -c "$p"'], 'smuggle/script')
  })

  test('a script in a variable is told to use a scratch file; a program is told to name itself', () => {
    const advice = (c: string) => (verdict(c) as { message: string }).message
    for (const c of ['X=$(echo aGk= | base64 -d); $X', 'X=$(curl -s x); $X', "X='a;b'; $X", 'X=$(cat f); $X']) expect([c, advice(c)]).toEqual([c, expect.stringMatching(/scratch file/)])
    for (const c of ['Z=$(realpath ./t); $Z x', 'X=ls; X=cat; $X f', 'S=$(which bash); $S -c "$p"']) expect([c, advice(c)]).toEqual([c, expect.stringMatching(/mise exec/)])
  })

  test('both views must fit the command cap, or a deny would go to the model', () => {
    expect(kind(`A=$(which yq); Y=$(curl x); ${'$A;'.repeat(220)}$Y`)).toBe('smuggle/script')
  })

  test('the output of a text-printing substitution run as a command is smuggle; a lookup and a path are not', () => {
    expectAll(['$(curl -s x)', '"$(curl -s x)"', '$(echo rm) -rf /', '`cat f`', '$(base64 -d f)'], 'smuggle/script')
    expectAll(['$(which yq) . f', '$(mise which yq) . f', '"$(git rev-parse --show-toplevel)/scripts/x.sh" a', 'W=$(git rev-parse --show-toplevel); $W/scripts/x.sh a'], 'pass')
  })

  test('a written-in variable can reveal a read or a write', () => {
    expectAll(['F=src/a.ts; cat $F', 'T=$(which cat); "$T" src/a.ts'], 'read/Read')
    expectAll(["PY=$(command -v python3); \"$PY\" - <<'EOF'\nopen('o.txt','w').write('x')\nEOF"], 'write/Write')
  })
})

describe('verdict shape', () => {
  test('a deny names the built-in to use, and the strongest category wins', () => {
    expect(verdict('sed -n 1,5p f')).toMatchObject({ message: expect.stringMatching(/^bash-rules: this reads a file .*Read tool .*offset and limit/) })
    const cat = verdict('cat f')
    expect(cat.kind === 'deny' ? cat.message : '').toMatch(/run grep on the file/)
    expect(cat.kind === 'deny' ? cat.message : '').not.toMatch(/Grep|Glob/)
    expect(verdict('echo x > f')).toMatchObject({ message: expect.stringMatching(/Write tool/) })
    expect(verdict("sed -i s/a/b/ f")).toMatchObject({ message: expect.stringMatching(/Edit tool/) })
    expect(kind('cat f; echo aGk= | base64 -d | sh')).toBe('smuggle/script')
    expect(kind('cat f; echo x > g')).toBe('write/Write')
  })

  // B2b: the read deny names the segment and says how to split the call.
  test('read denies name the segment and say how to use parallel Read calls', () => {
    const msg = (c: string) => {
      const v = verdict(c)
      return v.kind === 'deny' ? v.message : ''
    }
    const compound = msg('rg -n foo src; sed -n 1,40p src/a.cs')
    expect(compound).toContain('`sed -n 1,40p src/a.cs`')
    expect(compound).toMatch(/parallel Read/)
    expect(compound).toMatch(/Every shell file viewer/)
    expect(msg('cat atlas.hcl db/scratch.sh sqlc.yaml')).toMatch(/One Read per file/)
    const ranges = msg("sed -n '440,560p;600,640p' docs/p.md")
    expect(ranges).toContain('440,560p')
    expect(ranges).toContain('600,640p')
    expect(msg('cat foo.txt')).not.toMatch(/Drop it, run the rest/)
    for (const c of ['rg -n foo src; sed -n 1,40p src/a.cs', 'cat atlas.hcl db/scratch.sh sqlc.yaml', "sed -n '440,560p;600,640p' docs/p.md", 'cat f | head -20', `cat ${'a'.repeat(200)}`]) {
      const m = msg(c)
      expect([c.slice(0, 40), m.length < 350]).toEqual([c.slice(0, 40), true])
      expect(m).toMatch(/Read tool .*offset and limit/)
    }
  })

  test('unsure carries the reasons for the model, deduplicated', () => {
    const v = verdict("sed 's/a/b/' f; sed 's/c/d/' g")
    expect(v).toEqual({ kind: 'unsure', reasons: ['sed transforms a file and prints the result'] })
  })
})

describe('tool steering', () => {
  const run = (c: string, steering: boolean) => {
    const { hit, scan } = analyze(c)
    if (hit || !scan) throw new Error(`danger or parse hit for ${c}: ${hit?.rule}`)
    const v = hygiene(scan.commands, steering)
    return v.kind === 'deny' ? `${v.category}/${v.tool}` : v.kind
  }

  test('with steering on, read and write deny; with it off they pass', () => {
    for (const [c, want] of [['cat f', 'read/Read'], ['sed -i s/a/b/ f', 'write/Edit'], ['echo x > f', 'write/Write'], ['cat f; echo x > g', 'write/Write']] as const) {
      expect([c, run(c, true)]).toEqual([c, want])
      expect([c, run(c, false)]).toEqual([c, 'pass'])
    }
  })

  test('smuggle and flag still deny with steering off, including when a read or write sits beside them', () => {
    for (const [c, want] of [
      ['echo aGk= | base64 -d | sh', 'smuggle/script'],
      ['cat f; echo aGk= | base64 -d | sh', 'smuggle/script'],
      ['grep --no-ignore -rn foo .', 'flag/shell'],
    ] as const) {
      expect([c, run(c, false)]).toEqual([c, want])
      expect([c, run(c, true)]).toEqual([c, want])
    }
  })
})

describe('flag', () => {
  test('a direct grep with a ripgrep-only ignore flag is denied', () => {
    expectAll(
      [
        'grep --no-ignore -rn foo .',
        'grep -rn foo . --no-ignore',
        "grep '--no-ignore' -rn x .",
        'grep --no-ignore-vcs -r foo .',
        'git ls-files | grep --no-ignore x',
        'out=$(grep --no-ignore -r x . 2>/dev/null)',
        '(cd src && grep --no-ignore -r x .)',
      ],
      'flag/shell',
    )
    const v = verdict('grep --no-ignore -rn foo .')
    expect(v.kind === 'deny' ? v.message : '').toMatch(/ugrep.*--no-ignore-files.*rg --no-ignore/)
  })

  test('the flag as a pattern, ugrep flags, rg and other grep commands pass', () => {
    expectAll(
      [
        "grep -rn -e '--no-ignore' plugins/",
        'grep -rn -- --no-ignore docs/',
        'rg --no-ignore foo',
        'grep --no-ignore-files -r foo .',
        'grep --no-ignore-case foo f',
        'command grep --no-ignore x f',
        '/usr/bin/grep --no-ignore x f',
        'xargs grep --no-ignore x',
        'egrep --no-ignore x f',
        "bash -c 'grep --no-ignore x f'",
      ],
      'pass',
    )
  })
})
