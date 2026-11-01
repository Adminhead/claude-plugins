// Specs for the pure parts of install.mjs. Run: node --test scripts/install.spec.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { marketplacesOf, mergeSettings, needsOfficialMarketplace, offPluginsOf, planPlugins, pluginsOf } from './install.mjs'

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

test('gradle-skills is registered by the global and the project examples', () => {
  const project = JSON.parse(readFileSync(new URL('../examples/claude-settings/settings.project.json', import.meta.url)))
  for (const ex of [example, project]) {
    assert.ok(marketplacesOf(ex).some(([name, repo]) => name === 'gradle-skills' && repo === 'gradle/gradle-skills'))
  }
})

test('android-skills is registered by the global and the project examples', () => {
  const project = JSON.parse(readFileSync(new URL('../examples/claude-settings/settings.project.json', import.meta.url)))
  for (const ex of [example, project]) {
    assert.ok(marketplacesOf(ex).some(([name, repo]) => name === 'android-skills' && repo === 'android/skills'))
  }
})

test('plugins are baseline plus enabled marketplace plugins, not built-in or disabled ones', () => {
  const ids = pluginsOf(example, marketplacesOf(example))
  assert.equal(ids[0], 'baseline@adminhead')
  assert.ok(ids.includes('avoid-ai-writing@conorbronsdon-skills'))
  assert.ok(!ids.some(id => id.endsWith('@builtin') || id.endsWith('@synced')))
})

test('off-by-default plugins are listed apart from the enabled ones, including from the built-in official marketplace', () => {
  const m = marketplacesOf(example)
  assert.deepEqual(offPluginsOf(example, m), ['exa@claude-plugins-official'])
  assert.ok(!pluginsOf(example, m).includes('exa@claude-plugins-official'))
  assert.deepEqual(offPluginsOf({ enabledPlugins: { 'x@builtin': false, 'y@unknown': false } }, m), [])
})

test('merge keeps the user value only for off-by-default ids and adds them when absent', () => {
  const ex = { enabledPlugins: { 'exa@claude-plugins-official': false, 'design@synced': false, 'a@adminhead': true } }
  const keep = new Set(offPluginsOf(ex, marketplacesOf(example)))
  const user = { enabledPlugins: { 'exa@claude-plugins-official': true, 'design@synced': true, 'a@adminhead': false } }
  const { merged } = mergeSettings(user, ex, keep)
  assert.equal(merged.enabledPlugins['exa@claude-plugins-official'], true)
  assert.equal(merged.enabledPlugins['design@synced'], false)
  assert.equal(merged.enabledPlugins['a@adminhead'], true)
  assert.deepEqual(mergeSettings({}, ex, keep).merged, ex)
})

test('plan: install and disable an off plugin only when it is installed nowhere and not enabled by the user', () => {
  const m = marketplacesOf(example)
  const exa = 'exa@claude-plugins-official'
  const none = new Set()
  assert.deepEqual(planPlugins(example, m, none, none, {}).off, [exa])
  assert.deepEqual(planPlugins(example, m, none, none, { enabledPlugins: { [exa]: false } }).off, [exa])
  assert.deepEqual(planPlugins(example, m, none, none, { enabledPlugins: { [exa]: true } }).off, [])
  assert.deepEqual(planPlugins(example, m, none, new Set([exa]), {}).off, [])
  assert.deepEqual(planPlugins(example, m, new Set([exa]), new Set([exa]), {}).off, [])
})

test('the official marketplace is added only when a planned plugin needs it and it is absent', () => {
  const m = marketplacesOf(example)
  const none = new Set()
  const plan = planPlugins(example, m, none, none, {})
  assert.equal(needsOfficialMarketplace(plan, ['adminhead']), true)
  assert.equal(needsOfficialMarketplace(plan, ['adminhead', 'claude-plugins-official']), false)
  assert.equal(needsOfficialMarketplace({ main: [{ id: 'a@adminhead', action: 'install' }], off: [] }, []), false)
  assert.equal(needsOfficialMarketplace({ main: [], off: [] }, []), false)
})

test('plan: enabled plugins update when installed at user scope and install otherwise', () => {
  const m = marketplacesOf(example)
  const { main } = planPlugins(example, m, new Set(['baseline@adminhead']), new Set(['baseline@adminhead']), {})
  assert.deepEqual(main[0], { id: 'baseline@adminhead', action: 'update' })
  assert.ok(main.slice(1).every(p => p.action === 'install'))
})
