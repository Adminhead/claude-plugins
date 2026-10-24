import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decide } from '../check-bypass-guard.ts'
import { MAX_COMMAND } from '../git-bypass.ts'

// The session's cwd holds the configs the ask cases write to; nothing else, so hooks and .git/config are absent.
const dir = mkdtempSync(join(tmpdir(), 'cbg-bash-'))
for (const f of ['.eslintignore', 'web/.eslintignore', '.prettierignore', '.lintstagedrc.json', '.eslintrc.json', 'config/.eslintrc.json', 'deep/.prettierrc']) {
  mkdirSync(join(dir, f, '..'), { recursive: true })
  writeFileSync(join(dir, f), '')
}
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const verdict = (command: string) => decide({ tool_name: 'Bash', tool_input: { command }, cwd: dir })?.decision ?? null

describe('Bash writes to protected configs and hooks ask', () => {
  test('redirects', () => {
    for (const c of [
      'echo x >> .eslintignore',
      "echo 'src/' >> web/.eslintignore",
      "printf '' > .git/hooks/pre-commit",
      "cat > .husky/pre-commit <<'EOF'\nexit 0\nEOF",
      "echo '[core]' >> .git/config",
      ': > .git/config',
      '{ echo x; } >> .eslintignore',
      'echo x &> .prettierignore',
      'echo x >| .lintstagedrc.json',
      'echo x > .git/worktrees/wt/config.worktree',
      'exec 3> .eslintrc.json',
    ]) expect([c, verdict(c)]).toEqual([c, 'ask'])
  })

  test('rm, mv, cp, ln, chmod, truncate and tee operands', () => {
    for (const c of [
      'rm .pre-commit-config.yaml',
      'rm -rf .husky',
      'rm -rf .husky/',
      'rm -f .git/hooks/pre-commit',
      'rm .git/hooks/*',
      'rm -rf .git/hooks',
      'rm sub/../.husky/pre-commit',
      'chmod -x .git/hooks/pre-commit',
      'chmod 644 .husky/pre-commit',
      'mv .pre-commit-config.yaml /tmp/',
      'mv /tmp/x .eslintrc.json',
      'cp /tmp/x .eslintrc.json',
      'cp template/.eslintrc.json .',
      'cp template/.eslintrc.json config/',
      'cp -t .husky /tmp/pre-commit',
      'cp --target-directory=.git/hooks /tmp/pre-commit',
      'ln -sf /dev/null .git/hooks/pre-commit',
      'truncate -s 0 .eslintignore',
      'echo x | tee -a .prettierignore',
      'sudo rm .pre-commit-config.yaml',
      "bash -c 'rm -rf .husky'",
      'cd sub && rm ../.pre-commit-config.yaml',
      'xargs rm .eslintignore',
    ]) expect([c, verdict(c)]).toEqual([c, 'ask'])
  })

  test('in-place sed and perl', () => {
    for (const c of [
      'sed -i s/x/y/ .eslintrc.json',
      "sed -i.bak 's/a/b/' .eslintrc.json",
      "sed -Ei 's/a/b/' ruff.toml",
      "sed --in-place 's/a/b/' .flake8",
      "sed -i '' 's/a/b/' .golangci.yml",
      "gsed -i 's/a/b/' .eslintrc.json",
      "perl -pi -e 's/a/b/' .prettierrc",
      "perl -i -pe 's/a/b/' .eslintrc.json",
      "perl -pie 's/a/b/' .eslintrc.json",
    ]) expect([c, verdict(c)]).toEqual([c, 'ask'])
  })

  test('hook-manager uninstalls, directly and through package runners', () => {
    for (const c of [
      'pre-commit uninstall',
      'pre-commit uninstall -t pre-push',
      'npx husky uninstall',
      'npx --yes husky@9 uninstall',
      'npx -p husky husky uninstall',
      'pnpm dlx husky uninstall',
      'pnpm exec husky uninstall',
      'bunx husky uninstall',
      'bun x husky uninstall',
      'yarn husky uninstall',
      'npm exec -- husky uninstall',
      'lefthook uninstall',
      'npx lefthook uninstall',
      'uvx pre-commit uninstall',
      'pipx run pre-commit uninstall',
      'python3 -m pre_commit uninstall',
      './node_modules/.bin/husky uninstall',
    ]) expect([c, verdict(c)]).toEqual([c, 'ask'])
  })

  test('unparseable or over-long commands that name a protected path ask', () => {
    expect(verdict('rm .eslintignore $(')).toBe('ask')
    expect(verdict('echo ' + 'x '.repeat(MAX_COMMAND) + '> .eslintignore')).toBe('ask')
  })

  test('a wrapper or package runner still in front after the depth limit asks', () => {
    for (const c of ['nice '.repeat(9) + 'rm .eslintignore', 'npx '.repeat(5) + 'husky uninstall', 'npx '.repeat(9) + 'husky uninstall']) {
      expect([c, verdict(c)]).toEqual([c, 'ask'])
    }
  })

  test('configs that are not there yet still ask for rm, mv and tee; hooks and .git/config ask either way', () => {
    for (const c of [
      'rm .prettierrc',
      'mv /tmp/x .prettierrc',
      'echo x | tee .prettierrc',
      'echo x > .husky/pre-commit',
      'cp /tmp/x .git/hooks/pre-commit',
      "echo '[core]' > .git/config",
      'echo {} > ~/.prettierrc',
    ]) expect([c, verdict(c)]).toEqual([c, 'ask'])
  })
})

describe('creating a config that is not there yet', () => {
  test('a redirect or cp to a new config passes', () => {
    const fresh = join(dir, 'scratch-new', '.prettierrc')
    expect(existsSync(fresh)).toBe(false)
    for (const c of [
      `echo {} > ${fresh}`,
      'echo {} > .prettierrc',
      'echo {} > new/.eslintrc.json',
      'cp /tmp/x .prettierrc',
      'cp template/.prettierrc .',
      'nice '.repeat(8) + 'echo {} > .prettierrc',
    ]) expect([c, verdict(c)]).toEqual([c, null])
  })

  test('the same redirect or cp to an existing config asks', () => {
    for (const c of [
      'echo {} > .eslintrc.json',
      'echo {} > web/.eslintignore',
      `echo {} > ${join(dir, '.eslintrc.json')}`,
      'cp template/.eslintrc.json config/',
      // After a cd the relative path may name a config elsewhere, so it counts as present.
      'cd deep && echo {} > .prettierrc',
      '(cd deep; cp /tmp/x .prettierrc)',
    ]) {
      expect([c, verdict(c)]).toEqual([c, 'ask'])
    }
  })
})

describe('the Bash pass column', () => {
  test('ordinary writes, reads of protected files, and reads of hook dirs pass', () => {
    for (const c of [
      'echo x >> notes.txt',
      'rm build/out.js',
      'cat .eslintrc.json',
      'cat .git/config',
      'cp .eslintrc.json /tmp/eslintrc.bak',
      "sed 's/a/b/' .eslintrc.json",
      'sed -n p .eslintrc.json',
      "perl -ne 'print' .eslintrc.json",
      'grep -r x .husky',
      'ls .git/hooks',
      'chmod +x scripts/build.sh',
      'rm "$tmp"',
      'echo x > "$f"',
      'ls 2>&1',
      'mv a b',
      "echo '.eslintignore' > notes.txt",
      'git commit -m "rm -rf .husky"',
      'echo uninstall',
      'pre-commit run --all-files',
      'pre-commit install',
      'npx husky init',
      'npm uninstall husky',
      'lefthook install',
      'echo $(',
    ]) expect([c, verdict(c)]).toEqual([c, null])
  })

  test('long inputs stay fast', () => {
    const t0 = performance.now()
    verdict('rm ' + 'x '.repeat(20000))
    verdict('echo ' + 'x '.repeat(40000))
    verdict('echo ' + '.eslintrc.json '.repeat(300000))
    expect(performance.now() - t0).toBeLessThan(2000)
  })
})
