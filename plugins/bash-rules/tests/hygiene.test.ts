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
        'cd w && H="dotnet run --no-build --project src/Tools.Headless -- --content content"; $H --scenario content/scenarios/smoke.json --ticks 1200',
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

  test('a written-in variable can reveal a read or a write', () => {
    expectAll(['F=src/a.ts; cat $F', 'T=$(which cat); $T src/a.ts'], 'read/Read')
    expectAll(["PY=$(command -v python3); $PY - <<'EOF'\nopen('o.txt','w').write('x')\nEOF"], 'write/Write')
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
