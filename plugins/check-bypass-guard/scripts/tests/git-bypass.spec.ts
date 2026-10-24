import { describe, expect, test } from 'bun:test'
import { checkGit, MAX_COMMAND } from '../git-bypass.ts'

const rule = (c: string) => checkGit(c)?.rule ?? null

describe('git bypasses are denied', () => {
  test('--no-verify on hook-running subcommands, and its unambiguous prefixes', () => {
    for (const c of [
      'git commit --no-verify -m "x"',
      'git commit -m "x" --no-verify',
      'git push --no-verify',
      'git push origin main --no-verify',
      'git merge --no-verify feature',
      'git rebase --no-verify main',
      'git am --no-verify x.patch',
      'git commit --no-veri -m x',
      'git am --no-v x.patch',
      'git -C repo commit --no-verify',
      '/usr/bin/git commit --no-verify',
    ]) expect(rule(c)).toBe('no-verify')
  })

  test('commit -n, also inside a short-option cluster', () => {
    for (const c of ['git commit -n -m x', 'git commit -nm x', 'git commit -an -m x', 'git commit -vn']) expect(rule(c)).toBe('no-verify')
  })

  test('--no-gpg-sign and signing turned off with -c', () => {
    for (const c of ['git commit --no-gpg-sign -m x', 'git merge --no-gpg-sign x', 'git -c commit.gpgsign=false commit -m x', 'git -c commit.gpgSign=no commit -m x']) {
      expect(rule(c)).toBe('no-gpg-sign')
    }
  })

  test('core.hooksPath and include overrides', () => {
    for (const c of [
      'git -c core.hooksPath=/dev/null commit -m x',
      'git -c core.hookspath= commit -m x',
      'git -c CORE.HOOKSPATH=x push',
      'git -c include.path=/tmp/x commit',
      'git --config-env=core.hooksPath=X commit',
      'GIT_CONFIG_PARAMETERS="\'core.hooksPath\'=\'/dev/null\'" git commit -m x',
      'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/x git commit',
    ]) expect(rule(c)).toBe('hooks-path')
  })

  test('SKIP, HUSKY=0 and LEFTHOOK=0', () => {
    for (const c of [
      'SKIP=ruff git commit -m x',
      'SKIP=ruff,mypy git commit -m x',
      'HUSKY=0 git commit -m x',
      'LEFTHOOK=0 git push',
      'env SKIP=eslint git commit -m x',
      'export SKIP=ruff; git commit -m x',
      'export HUSKY=0 && git commit -m x',
      'SKIP="$HOOKS" git commit -m x',
    ]) expect(rule(c)).toBe('skip-env')
  })

  test('wrappers, compound commands and nested scripts are seen through', () => {
    for (const c of [
      'cd x && git commit --no-verify -m y',
      'git add . ; git commit -n -m y',
      'timeout 30 git push --no-verify',
      'env GIT_DIR=.git git commit --no-verify',
      "bash -c 'git commit --no-verify -m x'",
      'eval git commit --no-verify',
      "sh -c \"cd x && git push --no-verify\"",
      'if true; then git commit --no-verify; fi',
      'echo $(git commit --no-verify -m x)',
    ]) expect(rule(c)).not.toBeNull()
  })
})

describe('the pass column', () => {
  test('flags inside quoted messages and other words are not flags', () => {
    for (const c of [
      'git commit -m "do not use --no-verify"',
      "git commit -m '--no-verify'",
      'git commit -m --no-verify',
      'git commit -F --no-verify',
      'git commit --message=--no-verify',
      'git commit -m "SKIP=x"',
      'git commit -m "$(cat <<\'EOF\'\nexplain --no-verify and -n\nEOF\n)"',
      'echo git commit --no-verify',
      'grep -r -- --no-verify docs',
      'git log --grep=--no-verify',
      'git commit -- --no-verify',
    ]) expect(rule(c)).toBeNull()
  })

  test('-n means something else outside commit', () => {
    for (const c of ['git push -n', 'git merge -n x', 'git pull -n', 'git clean -n', 'git add -n .', 'git commit -mn']) expect(rule(c)).toBeNull()
  })

  test('ordinary git, signing on, and non-hook config', () => {
    for (const c of [
      'git commit -m x',
      'git push origin main',
      'git -c commit.gpgsign=true commit -m x',
      'git -c user.name=x commit -m x',
      'git commit -S -m x',
      'git commit -Snope -m x',
      'SKIP= git commit -m x',
      'HUSKY=1 git commit',
      'ls',
      'SKIP=x make test',
      'export SKIP=x',
    ]) expect(rule(c)).toBeNull()
  })
})

describe('persistent git config changes', () => {
  test('setting, unsetting or dropping core.hooksPath or an include path is denied', () => {
    for (const c of [
      'git config core.hooksPath /dev/null',
      'git config --global core.hooksPath x',
      'git config --local core.hooksPath x',
      'git config --worktree core.hooksPath x',
      'git config --system core.hookspath x',
      'git config --file .git/config core.hooksPath x',
      'git config -f .git/config core.hooksPath x',
      'git config --file=x core.hooksPath y',
      'git config --type=path core.hooksPath x',
      'git config set core.hooksPath x',
      'git config set --global core.hooksPath x',
      'git config set --glob core.hooksPath x',
      'git config --add core.hooksPath x',
      'git config --replace-all core.hooksPath x',
      'git config --repl core.hooksPath x',
      'git config --unset core.hooksPath',
      'git config --unset-all core.hooksPath',
      'git config --unset-al core.hooksPath',
      'git config unset core.hooksPath',
      'git config unset --all core.hooksPath',
      'git config --global --add include.path ~/x',
      'git config includeIf.gitdir:~/w/.path ~/x',
      'git config --remove-section core',
      'git config remove-section core',
      'git config --rem core',
      'git config --remove-section include',
      "git config --remove-section 'includeIf.gitdir:~/w/'",
      'git config --rename-section core x',
      'git config rename-section x core',
      'git -C repo config core.hooksPath x',
      'sudo git config --system core.hooksPath x',
      "bash -c 'git config core.hooksPath x'",
    ]) expect([c, rule(c)]).toEqual([c, 'hooks-path'])
  })

  test('turning signing off, or unsetting or dropping it, is denied', () => {
    for (const c of [
      'git config commit.gpgsign false',
      'git config --global commit.gpgSign false',
      'git config --bool tag.gpgsign no',
      'git config set commit.gpgsign false',
      'git config set --type=bool commit.gpgsign off',
      "git config commit.gpgsign ''",
      'git config --unset commit.gpgsign',
      'git config --unset-all commit.gpgsign',
      'git config unset tag.gpgsign',
      'git config --remove-section commit',
      'git config remove-section tag',
      'git config --rename-section commit x',
    ]) expect([c, rule(c)]).toEqual([c, 'no-gpg-sign'])
  })

  test('an editor, or a mutation whose key or value cannot be read, asks', () => {
    for (const c of [
      'git config --edit',
      'git config -e',
      'git config --global edit',
      'git config edit',
      'git config "$K" /dev/null',
      'git config commit.gpgsign "$V"',
      'git config unset "$K"',
      'git config --remove-section "$S"',
      'git config --frobnicate core.hooksPath',
      'git config --re core.hooksPath',
    ]) expect([c, rule(c)]).toEqual([c, 'config-edit'])
  })

  test('a deny later in the script wins over an earlier ask', () => {
    expect(rule('git config "$K" x; git commit --no-verify')).toBe('no-verify')
    expect(rule('git -c commit.gpgsign=2 commit --no-verify')).toBe('no-verify')
  })

  // git stops reading options at the first operand, so a later `--get`, `-l` or `--` is a value-pattern or the value.
  test('options after the first operand are operands, so the command still sets the key', () => {
    for (const [c, r] of [
      ['git config core.hooksPath /dev/null --get', 'hooks-path'],
      ['git config --global core.hooksPath /dev/null --list', 'hooks-path'],
      ['git config include.path /tmp/x --get-all', 'hooks-path'],
      ['git config core.hooksPath x -e', 'hooks-path'],
      ['git config core.hooksPath x --unset', 'hooks-path'],
      ['git config core.hooksPath -- /dev/null', 'hooks-path'],
      ['git config --file x -- core.hooksPath y', 'hooks-path'],
      ['git config set --file x core.hooksPath y', 'hooks-path'],
      ['git config set -- core.hooksPath y', 'hooks-path'],
      ['git config commit.gpgsign false -l', 'no-gpg-sign'],
      ['git config commit.gpgsign false --get', 'no-gpg-sign'],
    ]) expect([c, rule(c)]).toEqual([c, r])
  })

  test('any spelling of false or zero turns signing off; push signing is guarded too', () => {
    for (const c of [
      'git config commit.gpgsign 00',
      'git config commit.gpgsign 0x0',
      'git config commit.gpgsign 0k',
      "git config commit.gpgsign ' 0'",
      'git config commit.gpgsign FALSE',
      'git config push.gpgsign false',
      'git -c commit.gpgsign=00 commit -m x',
      'git -c tag.gpgsign=0x0 tag -s v1',
      'git -ccommit.gpgsign=0k commit -m x',
      'git config --remove-section push',
      'git config --rename-section push x',
    ]) expect([c, rule(c)]).toEqual([c, 'no-gpg-sign'])
  })

  test('a signing value that is neither plainly true nor false asks', () => {
    for (const c of ['git config commit.gpgsign 2', 'git config push.gpgsign if-asked', 'git -c commit.gpgsign=maybe commit -m x']) {
      expect([c, rule(c)]).toEqual([c, 'config-edit'])
    }
  })

  test('plainly true signing values pass', () => {
    for (const c of ['git config commit.gpgsign TRUE', 'git config commit.gpgsign yes', 'git config tag.gpgsign on', 'git config commit.gpgsign 1', 'git -c commit.gpgsign=1 commit -m x']) {
      expect([c, rule(c)]).toEqual([c, null])
    }
  })
})

describe('quoted command names', () => {
  test('quotes or a backslash inside `git` do not hide it', () => {
    for (const [c, r] of [
      ["g''it config core.hooksPath x", 'hooks-path'],
      ['"g"it config commit.gpgsign false', 'no-gpg-sign'],
      ['gi\\t config core.hooksPath x', 'hooks-path'],
      ["'git' commit --no-verify", 'no-verify'],
    ]) expect([c, rule(c)]).toEqual([c, r])
  })
})

describe('wrapper depth', () => {
  const nices = (n: number) => 'nice '.repeat(n)
  test('a wrapper still in front after the depth limit asks', () => {
    expect(rule(`${nices(9)}git config core.hooksPath x`)).toBe('unparsed')
    expect(rule(`${nices(9)}g''it commit -m x`)).toBe('unparsed')
    expect(rule(`${nices(9)}$'\\x67it' config core.hooksPath x`)).toBe('unparsed')
    expect(rule(`${nices(9)}ls`)).toBe('unparsed')
  })

  test('up to the limit the command is still read', () => {
    expect(rule(`${nices(8)}git config core.hooksPath x`)).toBe('hooks-path')
    expect(rule(`${nices(8)}git status`)).toBeNull()
    expect(rule(`${nices(8)}ls`)).toBeNull()
  })
})

describe('aliases that skip hooks or signing', () => {
  test('defining one is denied like the command it runs', () => {
    for (const [c, r] of [
      ['git config --global alias.ci "commit --no-verify"', 'no-verify'],
      ["git config alias.ci 'commit -n'", 'no-verify'],
      ["git config alias.ci 'commit -anm'", 'no-verify'],
      ["git config alias.ci 'commit --no-veri'", 'no-verify'],
      ["git config alias.pu 'push --no-verify'", 'no-verify'],
      ["git config set alias.ci 'commit --no-verify'", 'no-verify'],
      ["git config --add alias.ci 'commit --no-verify'", 'no-verify'],
      ["git config alias.cs 'commit --no-gpg-sign'", 'no-gpg-sign'],
      ["git config alias.ci '-c commit.gpgsign=false commit'", 'no-gpg-sign'],
      ["git config alias.ci '-c core.hooksPath=/dev/null commit'", 'hooks-path'],
      ["git config alias.off 'config core.hooksPath /dev/null'", 'hooks-path'],
      ["git config ALIAS.ci 'commit --no-verify'", 'no-verify'],
      ["git -c alias.ci='commit --no-verify' ci -m x", 'no-verify'],
    ]) expect([c, rule(c)]).toEqual([c, r])
  })

  test('a shell alias that names a bypass, or an alias value that cannot be read, asks', () => {
    for (const c of [
      "git config alias.ci '!git commit --no-verify'",
      'git config alias.ci \'!f() { git commit -n "$@"; }; f\'',
      "git config alias.ci '!git -c core.hooksPath=/dev/null commit'",
      "git config alias.ci '!SKIP=ruff git commit'",
      'git config alias.ci "$V"',
      "git config alias.ci 'commit -m \"x'",
    ]) expect([c, rule(c)]).toEqual([c, 'config-edit'])
  })

  test('ordinary aliases pass', () => {
    for (const c of [
      'git config alias.st status',
      "git config --global alias.ci 'commit -v'",
      "git config alias.lg 'log --oneline --graph'",
      "git config alias.amend 'commit --amend --no-edit'",
      "git config alias.cm 'commit -m'",
      "git config alias.pr '!gh pr create'",
      "git config alias.up '!git fetch && git rebase'",
      'git config alias.ci',
      'git config --unset alias.ci',
      "git -c alias.st=status st",
    ]) expect([c, rule(c)]).toEqual([c, null])
  })
})

describe('persistent git config reads', () => {
  test('reads, signing on and other keys pass', () => {
    for (const c of [
      'git config user.name x',
      'git config --get core.hooksPath',
      'git config core.hooksPath',
      'git config get core.hooksPath',
      'git config get --all include.path',
      'git config --get-all include.path',
      "git config --get core.hooksPath '^/'",
      'git config --get-all include.path x',
      'git config --get-regexp gpgsign false',
      'git config --get-urlmatch core https://x',
      'git config -l core.hooksPath x',
      'git config --list',
      'git config -l',
      'git config list --show-origin',
      "git config --get-regexp '^core\\.'",
      'git config --type bool --get commit.gpgsign',
      'git config commit.gpgsign true',
      'git config set commit.gpgsign true',
      'git config --unset user.email',
      'git config --remove-section alias',
      'git config --rename-section alias aliases',
      'git config --blob HEAD:x --list',
      'git config core.editor vim',
      'git config --global core.excludesFile ~/.gitignore',
      'git config "$K"',
      'git config --get core.hooksPath --global',
      'git config -l --show-origin',
    ]) expect([c, rule(c)]).toEqual([c, null])
  })
})

describe('unparsed git asks', () => {
  test('a git command that does not parse, or is over the limit, asks', () => {
    expect(rule('git commit -m "$(')).toBe('unparsed')
    expect(rule('git commit -m x ' + 'y'.repeat(MAX_COMMAND))).toBe('unparsed')
  })

  test('a non-git command that does not parse passes', () => {
    expect(rule('echo $(')).toBeNull()
    expect(rule('x'.repeat(MAX_COMMAND + 10))).toBeNull()
  })

  test('long inputs stay fast', () => {
    const t0 = performance.now()
    rule('git commit ' + '-m x '.repeat(8000))
    rule('git -c ' + 'a=b -c '.repeat(5000) + 'commit')
    rule('git commit -m "' + ' '.repeat(60000) + '"')
    expect(performance.now() - t0).toBeLessThan(2000)
  })
})
