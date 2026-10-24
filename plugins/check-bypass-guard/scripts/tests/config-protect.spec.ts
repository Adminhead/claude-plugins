import { describe, expect, test } from 'bun:test'
import { configVerdict, isProtectedName } from '../config-protect.ts'

const PYPROJECT = `[project]
name = "x"
dependencies = ["a"]

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F"]

[tool.pytest.ini_options]
addopts = "-q"
`

describe('protected names', () => {
  test('lint, format and hook configs and ignore files', () => {
    for (const n of [
      '.eslintrc.json', 'eslint.config.mjs', 'eslint.config.base.mjs', '.prettierrc', 'biome.json', 'ruff.toml', '.ruff.toml', '.flake8',
      'mypy.ini', '.golangci.yml', 'rustfmt.toml', 'clippy.toml', '.pre-commit-config.yaml', '.shellcheckrc', '.markdownlint.yaml',
      '.stylelintrc.json', '.eslintignore', '.prettierignore', '.ESLINTRC.JS',
    ]) expect(isProtectedName(n)).toBe(true)
  })

  test('lint-staged and commitlint configs', () => {
    for (const n of [
      '.lintstagedrc', '.lintstagedrc.json', '.lintstagedrc.yaml', '.lintstagedrc.mjs', 'lint-staged.config.js', 'lint-staged.config.mjs',
      '.commitlintrc', '.commitlintrc.json', '.commitlintrc.ts', 'commitlint.config.js', 'commitlint.config.cjs', 'commitlint.config.ts',
    ]) expect([n, isProtectedName(n)]).toEqual([n, true])
  })

  test('build and test configs are not', () => {
    for (const n of ['vite.config.ts', 'vitest.config.ts', 'jest.config.js', 'tsconfig.json', 'package.json', 'Cargo.toml', '.gitignore', 'pyproject.toml']) {
      expect(isProtectedName(n)).toBe(false)
    }
  })
})

describe('configVerdict', () => {
  test('editing or overwriting an existing config asks; creating one passes', () => {
    expect(configVerdict('Edit', { file_path: '/r/.eslintrc.json', old_string: 'a', new_string: 'b' }, '')).toMatch(/^check-bypass-guard: \.eslintrc\.json/)
    expect(configVerdict('Write', { file_path: '/r/ruff.toml', content: 'x' }, '')).not.toBeNull()
    expect(configVerdict('MultiEdit', { file_path: '/r/.golangci.yml', edits: [] }, '')).not.toBeNull()
    expect(configVerdict('Write', { file_path: '/r/ruff.toml', content: 'x' }, null)).toBeNull()
    expect(configVerdict('Edit', { file_path: '/r/src/app.ts', old_string: 'a', new_string: 'b' }, 'a')).toBeNull()
  })

  test('pyproject.toml: only edits to lint sections ask', () => {
    const edit = (old_string: string, new_string: string) => configVerdict('Edit', { file_path: '/r/pyproject.toml', old_string, new_string }, PYPROJECT)
    expect(edit('line-length = 100', 'line-length = 200')).not.toBeNull()
    expect(edit('select = ["E", "F"]', 'select = ["E"]')).not.toBeNull()
    expect(edit('dependencies = ["a"]', 'dependencies = ["a", "b"]')).toBeNull()
    expect(edit('addopts = "-q"', 'addopts = "-v"')).toBeNull()
    expect(edit('addopts = "-q"', 'addopts = "-q"\n\n[tool.mypy]\nignore_errors = true')).not.toBeNull()
    expect(edit('not in the file', 'x')).not.toBeNull()
  })

  test('pyproject.toml: a Write asks only when the lint sections change', () => {
    const write = (content: string) => configVerdict('Write', { file_path: '/r/pyproject.toml', content }, PYPROJECT)
    expect(write(PYPROJECT.replace('"a"]', '"a", "b"]'))).toBeNull()
    expect(write(PYPROJECT.replace('line-length = 100', 'line-length = 120'))).not.toBeNull()
    expect(write(PYPROJECT.replace(/\[tool\.ruff\.lint\][^[]*/, ''))).not.toBeNull()
    expect(configVerdict('Write', { file_path: '/r/pyproject.toml', content: '[tool.ruff]\n' }, null)).toBeNull()
  })

  test('pyproject.toml: MultiEdit applies edits in order', () => {
    const v = configVerdict('MultiEdit', { file_path: '/r/pyproject.toml', edits: [{ old_string: '"a"]', new_string: '"a", "$&"]' }, { old_string: 'addopts', new_string: 'addopts2' }] }, PYPROJECT)
    expect(v).toBeNull()
    const w = configVerdict('MultiEdit', { file_path: '/r/pyproject.toml', edits: [{ old_string: '"a"]', new_string: '"b"]' }, { old_string: 'line-length = 100', new_string: '' }] }, PYPROJECT)
    expect(w).not.toBeNull()
  })

  test('setup.cfg and tox.ini lint sections; an unreadable sectioned file asks', () => {
    const cfg = '[metadata]\nname = x\n\n[flake8]\nmax-line-length = 100\n'
    expect(configVerdict('Edit', { file_path: 'setup.cfg', old_string: 'max-line-length = 100', new_string: 'max-line-length = 200' }, cfg)).not.toBeNull()
    expect(configVerdict('Edit', { file_path: 'setup.cfg', old_string: 'name = x', new_string: 'name = y' }, cfg)).toBeNull()
    expect(configVerdict('Edit', { file_path: 'tox.ini', old_string: 'a', new_string: 'b' }, false)).not.toBeNull()
  })

  test('long lines and big files stay fast', () => {
    const big = '[project]\n' + ('[' + ' '.repeat(5000) + '\n').repeat(200) + 'x = 1\n'
    const t0 = performance.now()
    configVerdict('Edit', { file_path: 'pyproject.toml', old_string: 'x = 1', new_string: 'x = 2' }, big)
    expect(performance.now() - t0).toBeLessThan(500)
  })
})
