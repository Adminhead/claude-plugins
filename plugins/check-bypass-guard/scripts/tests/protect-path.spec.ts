import { describe, expect, test } from 'bun:test'
import { protectedPath } from '../protect-path.ts'

const kind = (p: string) => protectedPath(p)?.kind ?? null

describe('protectedPath', () => {
  test('hook directories, the directories themselves included', () => {
    for (const p of [
      '.husky', '.husky/', '.husky/pre-commit', '.husky/_/h', '/repo/.husky/pre-push', 'sub/../.husky/pre-commit', '.HUSKY/pre-commit',
      '.git/hooks', '.git/hooks/pre-commit', '.git/hooks/*', '/repo/.git/hooks/commit-msg', '../main/.git/hooks/pre-commit',
      '.git/worktrees/wt/hooks/pre-commit', 'C:\\repo\\.git\\hooks\\pre-commit', './.git/./hooks/pre-commit',
    ]) expect([p, kind(p)]).toEqual([p, 'hooks'])
  })

  test('git config files', () => {
    for (const p of ['.git/config', '/repo/.git/config', '.git/config.worktree', '.git/worktrees/wt/config.worktree', 'x/../.git/config']) {
      expect([p, kind(p)]).toEqual([p, 'git-config'])
    }
  })

  test('lint, format and hook configs by name', () => {
    for (const p of ['.eslintrc.json', 'web/.eslintignore', '/repo/.pre-commit-config.yaml', 'ruff.toml', '.lintstagedrc.json']) {
      expect([p, kind(p)]).toEqual([p, 'config'])
    }
  })

  test('other paths are not protected', () => {
    for (const p of [
      '', 'notes.txt', 'build/out.js', '.git', '.git/HEAD', '.git/info/exclude', '.git/config/x', '.gitconfig', 'hooks/pre-commit',
      'src/hooks/useThing.ts', '.husky.bak/x', 'docs/.git-hooks.md', '.git/hooks/../HEAD', 'pyproject.toml',
    ]) expect([p, kind(p)]).toEqual([p, null])
  })

  test('the shown text starts at the protected part', () => {
    expect(protectedPath('/repo/.git/hooks/pre-commit')?.shown).toBe('.git/hooks/pre-commit')
    expect(protectedPath('/repo/.husky')?.shown).toBe('.husky')
    expect(protectedPath('/repo/web/.eslintrc.json')?.shown).toBe('.eslintrc.json')
  })
})
