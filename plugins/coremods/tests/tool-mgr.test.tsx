import { describe, expect, test } from 'claude-code/testing'
import { cap, parseCommand } from '../hooks/tool-mgr/metrics'
import { askRule, buildRecord, classify, logPath, safeName, summarize, withAsk } from '../hooks/tool-mgr/rules'

const rule = (c: string) => classify(c)?.rule ?? null
const ask = (c: string) => askRule(c)?.rule ?? null

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
      "nohup python3 - <<EOF\nopen('a', 'w')\nEOF",
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

  test('commands in a substitution are not stages of the pipeline around them', () => {
    expect(rule('cat > f <<EOF\nx\nEOF\necho $(date) | bash')).toBe('heredoc-write')
    expect(rule('echo $(date) | python3; echo hi > f')).toBe('echo-write')
    expect(rule('cat $(ls) | python3 -')).toBeNull()
    expect(rule('echo "$(date)" | tee f')).toBe('echo-write')
    expect(rule('echo "v=$(git rev-parse HEAD)" | tee VERSION')).toBe('echo-write')
  })

  test('a sed fed by a here-string or heredoc that also names a file still reads it', () => {
    for (const c of ['sed -n p secret.txt <<< x', 'sed -n p secret.txt <<EOF\nx\nEOF', 'sed -e p f <<< x', 'sed -n -e p -- f <<< x']) expect(rule(c)).toBe('sed-read')
    for (const c of ['sed -n p <<< x', 'sed -e p <<< x', 'sed -ne p <<EOF\nx\nEOF', 'sed p - <<< x', 'sed --expression=p <<< x']) expect(rule(c)).toBeNull()
  })

  test('echo-write needs every command under the redirect or feeding the tee to be echo or printf', () => {
    for (const c of ['{ echo a; echo b; } > f', 'for i in 1 2; do echo $i; done > f', 'echo a | tee f', '(printf a; echo b) >> f']) expect(rule(c)).toBe('echo-write')
    for (const c of ['{ npm test; echo "exit=$?"; } 2>&1 | tee test.log', 'for f in *; do echo $f; wc -l $f; done > report', '{ echo a; ls; } > f', 'echo a | sort | tee f']) {
      expect(rule(c)).toBeNull()
    }
  })

  test('<> opens a file for writing', () => {
    expect(rule('echo x 1<>f')).toBe('echo-write')
    expect(rule('cat <<EOF 1<>f\nx\nEOF')).toBe('heredoc-write')
  })

  test('crafted long inputs are checked quickly', () => {
    const t0 = performance.now()
    expect(rule("python3 <<EOF\nopen(a,'" + 'w'.repeat(65000))).toBeNull()
    expect(rule('cat <<EOF | ' + 'cat | '.repeat(10000) + 'tee f\nx\nEOF')).toBe('heredoc-write')
    expect(rule('cat | '.repeat(10000) + 'cat')).toBeNull()
    expect(rule('cat | ' + 'tee f | '.repeat(7000) + 'cat')).toBeNull()
    expect(rule('cat | ' + 'x >f | '.repeat(7000) + 'cat')).toBeNull()
    expect(performance.now() - t0).toBeLessThan(1000)
  })

  // shortcut: a pipeline inside a substitution numbers its stages from 0, so they can match the outer previous stage.
  test('known gap: a pipeline inside a substitution hides an echo feeding tee', () => {
    expect(rule('echo "$(ls | wc -l)" | tee f')).toBeNull()
    expect(rule('echo "$(ls)" | tee f')).toBe('echo-write')
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

describe('danger rules', () => {
  test('rm-root: a recursive rm of the root, a system dir or a home dir, in every spelling', () => {
    for (const c of [
      'rm -rf /',
      'rm -r -f /',
      'rm -fr ~',
      'rm -Rf ~/',
      'rm --recursive --force /',
      'rm -rf /etc',
      'rm -rf /usr/',
      'rm -rf /home/buck',
      'rm -rf /Users/buck',
      'rm -rf ~/*',
      'rm -rf "$HOME"',
      'rm -rf $HOME/',
      'rm -rf ~buck',
      'rm -rf ~/..',
      'rm -rf /home/*',
      'rm -rf /home/buck/*',
      'rm --no-preserve-root /x',
      'rm -rf ./build /',
      'rm -rf -- /',
    ]) {
      expect(rule(c)).toBe('rm-root')
    }
  })

  test('rm-root: targets are normalized and globs that can match a protected path are caught', () => {
    for (const c of ['rm -rf //', 'rm -rf /.', 'rm -rf /..', 'rm -rf /./', 'rm -rf /etc/..', 'rm -rf /tmp/../etc', 'rm -rf ~/.', 'rm -rf /*', 'rm -rf /*/', 'rm -rf /e*', 'rm -rf /[b]in', 'rm -rf /?sr', 'rm -rf /*/*']) {
      expect(rule(c)).toBe('rm-root')
    }
    for (const c of ['rm -rf /xyz*', 'rm -rf /tmp/*', 'rm -rf /var/tmp/x', 'rm -rf /usr/local/x']) expect(rule(c)).toBeNull()
  })

  test('rm-root: wrappers, paths, quoting, compound commands and nested scripts are seen through', () => {
    for (const c of [
      '/bin/rm -rf /',
      '\\rm -rf /',
      'r""m -rf /',
      'timeout 5 rm -rf /',
      'timeout -s KILL 5 rm -rf /',
      'nice -n 5 rm -rf ~',
      'env X=1 rm -rf /',
      'nohup rm -rf ~',
      'time rm -rf /',
      'stdbuf -oL rm -rf /',
      'command rm -rf /',
      'builtin exec rm -rf /',
      'exec rm -rf /',
      'setsid rm -rf /',
      'xargs rm -rf /',
      'xargs -n1 rm -rf /',
      'find . -exec rm -rf / \\;',
      "find . -execdir sh -c 'rm -rf ~' \\;",
      "bash -lc 'rm -rf ~'",
      "timeout 5 bash -c 'rm -rf /'",
      'eval "rm -rf /"',
      '( rm -rf / )',
      '{ rm -rf /; }',
      'if true; then rm -rf ~; fi',
      'f(){ rm -rf /; }; f',
      'bash <<EOF\nrm -rf /\nEOF',
      'echo $(rm -rf ~)',
      'cd x && rm -rf /',
    ]) {
      expect(rule(c)).toBe('rm-root')
    }
  })

  test('rm-root: find from a protected path with -delete or -exec rm', () => {
    for (const c of ['find / -delete', 'find ~ -name "*.o" -delete', 'find / -exec rm {} +', 'find /etc -execdir rm -f {} \\;', 'find -L /home/buck -delete', 'find /usr -ok rm {} \\;']) {
      expect(rule(c)).toBe('rm-root')
    }
    for (const c of ['find / -name x', 'find . -delete', 'find ~/.cache -delete', 'find /tmp -exec rm {} +', 'find / -exec grep x {} +']) expect(rule(c)).toBeNull()
  })

  test('rm-root: the pass column', () => {
    for (const c of [
      'rm -rf ./build',
      'rm -rf "$HOME/proj/out"',
      'rm -rf ~/proj',
      'rm -rf /tmp/x',
      'rm -rf build /tmp/y',
      'rm -f /etc/x',
      'rm /',
      "rm -rf '~'",
      'rm -rf "~"',
      'rm -rf ~+',
      'rm -rf ..',
      'echo "rm -rf /"',
      "echo 'rm -rf ~'",
      'git commit -m "rm -rf /"',
      'grep rm -rf /',
      'rm -rf "$DIR"',
      'rm -rf "$HOME"x',
    ]) {
      expect(rule(c)).toBeNull()
    }
  })

  test('disk-wipe: block cases', () => {
    for (const c of [
      'mkfs.ext4 /dev/sda1',
      'mkfs -t ext4 /dev/nvme0n1p2',
      'mkfs.ext4 "$DEV"',
      'wipefs -a /dev/sda',
      'blkdiscard /dev/sdb',
      'sgdisk -Z /dev/sda',
      'sgdisk --zap-all /dev/sda',
      'sgdisk -og /dev/sda -Z',
      'dd if=/dev/zero of=/dev/sda bs=1M',
      'dd of=/dev/mmcblk0',
      'shred -n 3 /dev/sda',
      'echo x > /dev/sda',
      'cat img >> /dev/nvme0n1',
      '/sbin/mkfs.xfs /dev/sdc',
      'timeout 5 dd of=/dev/sda',
    ]) {
      expect(rule(c)).toBe('disk-wipe')
    }
  })

  test('disk-wipe: the pass column', () => {
    for (const c of [
      'dd if=/dev/zero of=./img bs=1M count=1',
      'dd if=/dev/sda of=./backup.img',
      'lsblk',
      'echo x > /dev/null',
      'cat f > /dev/stderr',
      'mkfs.ext4 -F ./disk.img',
      'mkfs.ext4 -q -F -E offset=1048576 /tmp/disk.img 60M',
      'wipefs --help',
      'sgdisk -p /dev/sda',
      'shred -u secret.txt',
      'ls /dev/sda',
      'echo mkfs /dev/sda',
    ]) {
      expect(rule(c)).toBeNull()
    }
  })

  test('system-perms: recursive chmod, chown and chgrp on / or a system dir', () => {
    for (const c of ['chmod -R 777 /', 'chown -R root /usr', 'chgrp --recursive x /etc/', 'chmod -Rf 755 /var', 'chmod -R 755 /*', 'chown -R x:x //', '/bin/chmod -R 0 /', 'find . -exec chmod -R 0 / \\;', 'nice chown -R x /home']) {
      expect(rule(c)).toBe('system-perms')
    }
  })

  test('system-perms: the pass column', () => {
    for (const c of ['chown -R buck:buck ~/proj', 'chmod -R u+w ./dist', 'chown -R "$USER" ~', 'chmod 755 /', 'chown buck /etc/x', 'chmod -R 755 /usr/local/share/x', 'chmod -R 755 /home/buck', 'echo chmod -R 777 /']) {
      expect(rule(c)).toBeNull()
    }
  })

  test('priv-escalation: sudo, doas, su, pkexec and run0 anywhere a command can sit', () => {
    for (const c of [
      'sudo apt install x',
      '/usr/bin/sudo -n true',
      'env sudo ls',
      'echo $(sudo id)',
      "bash -c 'doas ls'",
      'su -c ls',
      'pkexec x',
      'run0 x',
      'nice -n 5 sudo -u x ls',
      'timeout 5 sudo ls',
      'xargs sudo ls',
      'find . -exec sudo rm {} \\;',
      'ls && sudo ls',
      '(sudo id)',
      'if true; then sudo ls; fi',
      'cat < <(sudo id)',
      'FOO=1 sudo ls',
      'bash <<EOF\nsudo ls\nEOF',
      'echo hi | sudo tee f',
      'doas -u x ls',
    ]) {
      expect(rule(c)).toBe('priv-escalation')
    }
  })

  test('priv-escalation runs first, so a sudo rm names the privilege, and other rules still see through sudo', () => {
    for (const c of ['sudo rm -rf /', 'sudo env X=1 rm -rf ~', 'sudo -u root chmod -R 777 /', 'sudo mkfs.ext4 /dev/sda']) expect(rule(c)).toBe('priv-escalation')
    expect(classify('sudo rm -rf /')?.message).toMatch(/^tool-mgr: .*sudo, doas, su, pkexec, run0.*user/)
  })

  test('priv-escalation: the pass column', () => {
    for (const c of ['echo sudo', 'git commit -m "sudo fix"', 'man sudo', 'command -v sudo', 'which sudo', 'grep sudo /etc/hosts', 'ssh host ls', 'echo $SUDO_USER', 'ls sudo']) {
      expect(rule(c)).toBeNull()
    }
  })

  test('danger rules come before the hygiene rules', () => {
    expect(rule('sed -n 1p f; rm -rf /')).toBe('rm-root')
    expect(rule('echo x > f; sudo ls')).toBe('priv-escalation')
    expect(rule('cat > f <<EOF\nx\nEOF\nrm -rf ~')).toBe('rm-root')
    expect(classify('rm -rf /')?.message).toMatch(/^tool-mgr: .*rm/)
  })

  test('a wrapped shell script is checked for hygiene too', () => {
    expect(rule("timeout 5 bash -c 'echo hi > f'")).toBe('echo-write')
    expect(rule("find . -exec sh -c 'sed -n 1p {}' \\;")).toBe('sed-read')
    expect(rule("timeout 4 bash -c 'echo > /dev/tcp/10.0.0.1/5432'")).toBeNull()
  })

  test('git-rewrite (ask): force pushes, +refspecs and hard resets', () => {
    for (const c of [
      'git push -f origin main',
      'git push origin +main',
      'git -C repo push --force',
      'git reset --hard HEAD~1',
      'git push --force-with-lease origin x',
      'git push --force-with-lease=main:abc origin main',
      'git push -fu origin x',
      'git -c user.name=x push --force',
      'git --git-dir .git push -f',
      'git reset -q --hard main',
      'cd x && git reset --hard',
      'sudo git push -f',
      "bash -c 'git push -f'",
    ]) {
      expect(ask(c)).toBe('git-rewrite')
    }
    expect(rule('git push -f origin main')).toBeNull()
  })

  test('git-rewrite (ask): the pass column', () => {
    for (const c of ['git push', 'git push origin main', 'git push -u origin feature', 'git reset --soft HEAD~1', 'git reset HEAD file', 'git reset', 'git commit -m "git push -f"', 'echo git reset --hard', 'git log --force', 'git push --no-force origin x', 'git push origin HEAD:+main']) {
      expect(ask(c)).toBeNull()
    }
  })

  test('remote-exec (ask): a download or decode piped into a shell or interpreter that reads stdin', () => {
    for (const c of [
      'curl x | bash',
      'curl -fsSL https://x/install.sh | sh',
      'curl x | sh -s -- --yes',
      'wget -qO- x | bash',
      'curl x | python3',
      'curl x | python3 -',
      'curl x | node',
      'curl x | tee f | zsh',
      'curl x | jq -r .script | bash',
      'echo aGk= | base64 -d | bash',
      'cat x | xxd -r | sh',
      'curl x | source /dev/stdin',
      'curl x | /bin/bash',
      'cd x && curl x | bash',
      '(curl x | bash)',
      'echo $(curl x) | bash',
      'curl x | env bash',
      'curl x | python3 -u -',
    ]) {
      expect(ask(c)).toBe('remote-exec')
    }
  })

  test('remote-exec (ask): process and command substitutions that hand a download to a shell', () => {
    for (const c of ['bash <(curl x)', 'source <(curl -s x)', '. <(wget -qO- x)', 'zsh <(curl x)', 'eval "$(curl x)"', 'sh -c "$(curl -fsSL x)"', 'bash <<< "$(curl x)"', 'bash -c "$(wget -qO- x)"', 'bash < <(curl x)', 'eval $(curl x | tr a b)']) {
      expect(ask(c)).toBe('remote-exec')
    }
  })

  test('remote-exec (ask): the pass column', () => {
    for (const c of [
      'curl x | jq .',
      'curl x | python3 -m json.tool',
      "curl x | python3 -c 'import sys; print(sys.stdin.read())'",
      'curl -o f x',
      'curl x > f; bash f',
      'curl x | bash -c "cat"',
      'curl x | bash script.sh',
      'curl x | grep y',
      'echo hi | bash',
      'cat f | base64 -d | jq .',
      'base64 -d f | cat',
      'bash "$f"; curl y',
      'eval $L; curl y',
      'bash script.sh && curl x',
      'echo "curl x | bash"',
      'git commit -m "curl x | sh"',
    ]) {
      expect(ask(c)).toBeNull()
    }
  })

  test('ask rules do not fire on a command classify denies, and a parse error has no ask', () => {
    expect(rule('sudo curl x | bash')).toBe('priv-escalation')
    expect(askRule('echo $(')).toBeNull()
    expect(askRule('x'.repeat(65537))).toBeNull()
  })

  test('crafted long inputs stay fast', () => {
    const t0 = performance.now()
    expect(rule('rm -rf /tmp/a ' + 'x '.repeat(20000))).toBeNull()
    expect(ask('curl x | ' + 'cat | '.repeat(5000) + 'bash')).toBe('remote-exec')
    expect(ask('curl x | ' + 'bash | '.repeat(1500) + 'cat')).toBe('remote-exec')
    expect(rule('sudo '.repeat(5000) + 'ls')).toBe('priv-escalation')
    expect(rule('env '.repeat(5000) + 'ls')).toBeNull()
    expect(rule('rm -rf /[' + 'a'.repeat(20000))).toBe(null)
    expect(performance.now() - t0).toBeLessThan(2000)
  })
})

describe('danger rules: review fixes', () => {
  test('a heredoc shared by many commands is reparsed once, and the work is capped', () => {
    for (const n of [3000, 6000]) {
      const t0 = performance.now()
      expect(rule('rm -rf ~; { ' + 'bash;'.repeat(n) + ' } <<Q\n' + 'a\n'.repeat(10000) + 'Q\n')).toBe('rm-root')
      expect(performance.now() - t0).toBeLessThan(1000)
    }
    const nest = (inner: string, n: number): string => (n === 0 ? inner : nest('eval "' + inner.replace(/[\\"$`]/g, '\\$&') + '"', n - 1))
    const deep = nest('echo ' + 'a '.repeat(30000), 7)
    expect(deep.length).toBeLessThan(65536)
    expect(classify(deep)).toEqual({ rule: 'too-long', message: expect.stringMatching(/nests too much/) })
    expect(rule(nest('echo hi', 7))).toBeNull()
  })

  test('an interpreter body shared by many commands is matched once', () => {
    const t0 = performance.now()
    const c = '{ ' + 'python3;'.repeat(4000) + " } <<'Q'\n" + 'open('.repeat(6000) + "\nQ\npython3 <<'R'\nopen('f','w')\nR"
    expect(c.length).toBeLessThan(65536)
    expect(rule(c)).toBe('heredoc-write')
    expect(performance.now() - t0).toBeLessThan(1000)
  })

  test('a shell heredoc inside a shell heredoc body is read', () => {
    expect(rule("bash <<'A'\nbash <<'B'\nrm -rf ~\nB\nA")).toBe('rm-root')
    expect(rule("bash <<'A'\nbash <<'B'\nbash <<'C'\necho hi > f\nC\nB\nA")).toBe('heredoc-write')
    expect(rule("bash <<'A'\nbash <<'B'\necho hi\nB\nA")).toBeNull()
  })

  test('remote-exec checks a long pipeline in linear time', () => {
    const t0 = performance.now()
    expect(ask('sh' + '|sh'.repeat(15000))).toBeNull()
    expect(rule('sh' + '|sh'.repeat(15000))).toBeNull()
    expect(ask('curl x | ' + 'cat | '.repeat(8000) + 'sh')).toBe('remote-exec')
    expect(ask('echo $(curl x) | ' + 'cat | '.repeat(5000) + 'sh | ' + 'sh | '.repeat(5000) + 'cat')).toBe('remote-exec')
    expect(performance.now() - t0).toBeLessThan(1000)
  })

  test('${HOME} with an operation that keeps or trims it still names home', () => {
    for (const c of ['rm -rf "${HOME:?}"', 'rm -rf "${HOME:?}/"', 'rm -rf "${HOME%/}"', 'rm -rf ${HOME:-/x}', 'rm -rf "${HOME%%/}"/*']) expect(rule(c)).toBe('rm-root')
    for (const c of ['rm -rf "${HOME:?}/proj"', 'rm -rf "${HOME#x}"', 'rm -rf "${HOME:+x}"']) expect(rule(c)).toBeNull()
  })

  test('heredoc bodies fed to a shell are checked whatever options the shell has', () => {
    for (const sh of ['bash -euo pipefail', 'bash -o pipefail', 'bash -eo pipefail', 'bash +o history', 'bash -O extglob', 'dash', 'ksh', 'bash -s -- arg', 'bash -s', 'bash -', 'sh -l', 'env bash -e', 'bash --norc', 'bash --rcfile x', 'timeout 5 bash -eu']) {
      expect(rule(`${sh} <<'E'\nrm -rf ~\nE`)).toBe('rm-root')
    }
    for (const sh of ['bash script.sh', "bash -c 'echo hi'", 'bash -o pipefail script.sh']) expect(rule(`${sh} <<'E'\nrm -rf ~\nE`)).toBeNull()
  })

  test('remote-exec: a shell or interpreter with option values or no program file reads stdin', () => {
    for (const c of ['curl x | bash -euo pipefail', 'curl x | bash -o pipefail', 'curl x | bash -O extglob', 'curl x | dash', 'curl x | ksh -s -- a', 'curl x | python3 -X utf8 -', 'curl x | python3 -W ignore', 'curl x | python3 -u', 'curl x | node --require ./x -', 'curl x | uv run python -']) {
      expect(ask(c)).toBe('remote-exec')
    }
  })

  test('remote-exec: attached inline code and program files are not stdin programs', () => {
    for (const c of [
      "curl x | python3 -c'print(1)'",
      'curl x | python3 -mjson.tool',
      "curl x | node -e'1'",
      "curl x | perl -ne'print'",
      "curl x | ruby -e'p 1'",
      'curl x | python3 -m json.tool',
      'curl x | node --eval "1"',
      'curl x | php -r "echo 1;"',
      'curl x | bash -c cat',
    ]) {
      expect(ask(c)).toBeNull()
    }
  })

  test('env -S runs its string, whatever the spelling', () => {
    for (const c of ["env -S 'rm -rf /'", 'env -S"rm -rf /"', "env --split-string='rm -rf ~'", "env -iS 'rm -rf ~'", "env -u X -S 'rm -rf /' y", "ksh -c 'rm -rf ~'"]) expect(rule(c)).toBe('rm-root')
    for (const c of ["env -S 'echo hi'", 'env X=1 ls']) expect(rule(c)).toBeNull()
  })

  test('everything inside a system dir, and home dotfile globs, are protected', () => {
    for (const c of ['rm -rf /usr/*', 'rm -rf /etc/*', 'rm -rf /var/*/', 'rm -rf /us*/*', 'rm -rf ~/.*', 'rm -rf "$HOME"/.*', 'rm -rf ~/.[!.]*', 'rm -rf ~/.??*', 'rm -rf /home/buck/.*']) {
      expect(rule(c)).toBe('rm-root')
    }
    for (const c of ['chmod -R 777 /usr/*', 'chown -R x /etc/*', 'chmod -R 777 /run', 'chmod -R 777 /Users']) expect(rule(c)).toBe('system-perms')
    for (const c of ['rm -rf /usr/local/*', 'rm -rf /tmp/*', 'rm -rf ~/.cache', 'rm -rf ~/.cache/*', 'rm -rf ~/.c*', 'rm -rf /usr/local', 'chmod -R 755 /usr/local/*']) expect(rule(c)).toBeNull()
    expect(rule('rm -rf /run')).toBe('rm-root')
    expect(rule('rm -rf /Users')).toBe('rm-root')
  })

  test('disk-wipe: devices are normalized, tee counts, and more tools are covered', () => {
    for (const c of [
      'dd if=x of=/dev/./sda',
      'dd of=//dev/sda',
      'dd of=/dev/../dev/sda',
      'echo x > /dev/./sda',
      'cat x >> //dev/nvme0n1',
      'cat img | tee /dev/sda',
      'dd of=/dev/rdisk2',
      'shred /dev/disk3',
      'mke2fs /dev/sda1',
      'mkswap /dev/sda2',
      'mkswap "$DEV"',
      'cryptsetup luksFormat /dev/sda1',
      'cryptsetup luksFormat --type luks2 /dev/sda1',
      'sgdisk --clear /dev/sda',
    ]) {
      expect(rule(c)).toBe('disk-wipe')
    }
    for (const c of ['mke2fs ./img', 'mkswap ./swapfile', 'cryptsetup luksFormat ./vol.img', 'cryptsetup open /dev/sda1 x', 'cat x | tee out.txt', 'sgdisk --clear ./img', 'dd of=/dev/null', 'dd of=/dev/shm/x']) {
      expect(rule(c)).toBeNull()
    }
    expect(rule('sudoedit /etc/hosts')).toBe('priv-escalation')
  })

  test('disk-wipe: mkfs skips the values of its options', () => {
    for (const c of ['mkfs.ext4 -F -L "$LABEL" ./disk.img', 'mkfs.vfat -n "$NAME" img', 'mkfs.ext4 -L lbl -E offset=1 ./d.img', 'mkfs -t ext4 ./d.img', 'mkfs.ext4 -b 4096 d.img']) {
      expect(rule(c)).toBeNull()
    }
    for (const c of ['mkfs.ext4 -L lbl "$DEV"', 'mkfs.ext4 /dev/sdb1', 'mkfs.ext4 -F -L x /dev/sdb1', 'mkfs.vfat -n NAME -F 32 /dev/sdb1', 'mkfs -t ext4 /dev/./sda1']) {
      expect(rule(c)).toBe('disk-wipe')
    }
  })

  test('find runs any danger rule on what it executes', () => {
    for (const c of ['find / -exec chmod 777 {} +', 'find /etc -execdir chown root {} \\;', 'find /usr -ok chgrp x {} \\;']) expect(rule(c)).toBe('system-perms')
    for (const c of ['find ~ -exec sh -c \'rm -rf "$1"\' _ {} \\;', "find / -exec bash -c 'rm -f \"$0\"' {} +", "find ~ -exec env -S 'rm -rf {}' \\;"]) expect(rule(c)).toBe('rm-root')
    for (const c of ['find ~/proj -exec chmod 644 {} +', 'find ~ -exec chmod +x {} \\;', 'find / -exec grep x {} +', "find ~ -exec sh -c 'echo \"$1\"' _ {} \\;", 'find /tmp -exec rm {} +']) expect(rule(c)).toBeNull()
  })

  test('remote-exec: only the program text counts, not script arguments', () => {
    for (const c of [
      'bash ./release.sh "$(curl -s x)"',
      'sh scripts/deploy.sh --version "$(wget -qO- x)"',
      'source ./env.sh "$(curl -s x)"',
      "bash -c 'echo $1' _ \"$(curl -s x)\"",
      'V=$(curl -s x) bash run.sh "$1"',
      'python3 run.py "$(curl x)"',
    ]) {
      expect(ask(c)).toBeNull()
    }
    for (const c of ['bash <(curl x)', 'eval "$(curl x)"', 'sh -c "$(curl x)"', 'bash <<EOF\n$(curl x)\nEOF', 'python3 <(curl x)', 'bash <<< "$(curl x)"', 'bash < <(curl x)', 'source <(curl x)', 'python3 -c "$(curl x)"', 'eval foo "$(curl x)"']) {
      expect(ask(c)).toBe('remote-exec')
    }
    expect(ask("bash <<'EOF'\n$(curl x)\nEOF")).toBeNull()
  })

  test('git-rewrite: option values are not refspecs, and --mirror asks', () => {
    for (const c of ['git push --push-option +trace origin main', 'git push -o +x origin main', 'git push --repo +x']) expect(ask(c)).toBeNull()
    for (const c of ['git push --mirror', 'git push --mirror origin', 'git push -o x origin +main', 'git push -- origin +main']) expect(ask(c)).toBe('git-rewrite')
  })
})

describe('classic.PreToolUse composition', () => {
  const run = (command: string, inner?: Record<string, unknown>) => {
    const log: string[] = []
    const out = withAsk(
      command,
      async () => {
        log.push('next')
        return inner
      },
      err => log.push(`error:${String(err)}`),
    )
    return { out, log }
  }

  test('it calls next and returns an ask when nothing below answers', async () => {
    const { out, log } = run('curl x | bash')
    expect(await out).toEqual({ ask: expect.stringMatching(/^tool-mgr: .*downloaded/) })
    expect(log).toEqual(['next'])
    expect(await run('git push -f origin main').out).toEqual({ ask: expect.stringMatching(/^tool-mgr: .*force-pushes/) })
  })

  test('an allow below gives way to the ask, and keeps its other fields', async () => {
    expect(await run('curl x | bash', { allow: true }).out).toEqual({ ask: expect.any(String) })
    expect(await run('curl x | bash', { allow: true, additionalContext: ['n'] }).out).toEqual({ ask: expect.any(String), additionalContext: ['n'] })
  })

  test('a deny below always wins, and an ask below stays', async () => {
    expect(await run('curl x | bash', { deny: 'readonly-bash: no' }).out).toEqual({ deny: 'readonly-bash: no' })
    expect(await run('git reset --hard', { ask: 'cloud-ops-guard: confirm' }).out).toEqual({ ask: 'cloud-ops-guard: confirm' })
  })

  test('next runs for every command, and a command with no ask returns its result unchanged', async () => {
    const { out, log } = run('ls', { deny: 'x' })
    expect(await out).toEqual({ deny: 'x' })
    expect(log).toEqual(['next'])
    expect(await run('ls').out).toEqual({})
    expect(await run('ls', { allow: true }).out).toEqual({ allow: true })
  })

  test('a throw in our rules keeps the verdict from below and is reported', async () => {
    const r = run(null as unknown as string, { allow: true })
    expect(await r.out).toEqual({ allow: true })
    expect(r.log).toEqual([expect.stringMatching(/^error:/), 'next'])
  })

  test('our ask is worked out before next runs, so a rejecting hook below cannot lose it', async () => {
    const log: string[] = []
    const out = await withAsk(
      'curl x | bash',
      async () => {
        log.push('next')
        throw new Error('hook below crashed')
      },
      err => log.push(`error:${(err as Error).message}`),
    )
    expect(out).toEqual({ ask: expect.any(String) })
    expect(log).toEqual(['next', 'error:hook below crashed'])
    let thrown = ''
    await withAsk('ls', async () => { throw new Error('boom') }, () => {}).catch(e => (thrown = e.message))
    expect(thrown).toBe('boom')
  })

  test('with the deny tier, classify() denies the ask rules and the hook only passes the verdict through', async () => {
    const hit = classify('curl x | bash', 'deny')
    expect(hit).toEqual({ rule: 'remote-exec', message: expect.stringMatching(/downloaded.*Hand this command to the user/) })
    expect(classify('git push -f origin main', 'deny')?.rule).toBe('git-rewrite')
    expect(classify('git push', 'deny')).toBeNull()
    expect(classify('curl x | bash', 'ask')).toBeNull()
    expect(classify('sudo curl x | bash', 'deny')?.rule).toBe('priv-escalation')
    expect(await withAsk('curl x | bash', async () => ({ allow: true }), () => {}, 'deny')).toEqual({ allow: true })
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
