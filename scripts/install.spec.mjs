// Specs for the pure parts of install.mjs. Run: node --test scripts/install.spec.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { marketplacesOf, mergeSettings, pluginsOf } from './install.mjs'

const example = JSON.parse(readFileSync(new URL('../examples/claude-settings/settings.global.json', import.meta.url)))

test('merge keeps keys only the user has and lets example scalars win', () => {
  const current = { model: 'sonnet', hooks: { SessionStart: [{ x: 1 }] }, env: { MINE: '1', USE_BUILTIN_RIPGREP: '1' } }
  const { merged, changes } = mergeSettings(current, { model: 'opus', env: { USE_BUILTIN_RIPGREP: '0', NEW: 'x' } })
  assert.equal(merged.model, 'opus')
  assert.deepEqual(merged.hooks, current.hooks)
  assert.deepEqual(merged.env, { MINE: '1', USE_BUILTIN_RIPGREP: '0', NEW: 'x' })
  assert.deepEqual(changes, ['model (changed)', 'env.USE_BUILTIN_RIPGREP (changed)', 'env.NEW (added)'])
})

test('merge unions arrays without duplicates', () => {
  const { merged, changes } = mergeSettings({ permissions: { allow: ['Bash(npm test)', 'a'] } }, { permissions: { allow: ['a', 'b'] } })
  assert.deepEqual(merged.permissions.allow, ['Bash(npm test)', 'a', 'b'])
  assert.deepEqual(changes, ['permissions.allow (+1)'])
})

test('merging the example twice changes nothing the second time', () => {
  const once = mergeSettings({}, example).merged
  assert.deepEqual(mergeSettings(once, example).changes, [])
  assert.deepEqual(once, example)
})

test('merge does not mutate its inputs', () => {
  const current = { env: { A: '1' } }
  mergeSettings(current, { env: { A: '2' } })
  assert.deepEqual(current, { env: { A: '1' } })
})

test('marketplaces come from the example, adminhead first', () => {
  const m = marketplacesOf(example)
  assert.deepEqual(m[0], ['adminhead', 'Adminhead/claude-plugins'])
  assert.ok(m.some(([name]) => name === 'claude-code-lsps'))
  assert.deepEqual(marketplacesOf({}), [['adminhead', 'Adminhead/claude-plugins']])
})

test('plugins are baseline plus enabled marketplace plugins, not built-in or disabled ones', () => {
  const ids = pluginsOf(example, marketplacesOf(example))
  assert.equal(ids[0], 'baseline@adminhead')
  assert.ok(ids.includes('avoid-ai-writing@conorbronsdon-skills'))
  assert.ok(!ids.some(id => id.endsWith('@builtin') || id.endsWith('@synced')))
})
