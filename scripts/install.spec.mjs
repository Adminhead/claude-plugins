// Specs for the pure parts of install.mjs. Run: node --test scripts/install.spec.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  marketplacesOf, mergeSettings, needsOfficialMarketplace, offPluginsOf, planPlugins, pluginsOf,
  pruneArchived, retiredNotices, withoutArchived,
} from './install.mjs'

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

test('the project example registers claude-plugins-official', () => {
  const project = JSON.parse(readFileSync(new URL('../examples/claude-settings/settings.project.json', import.meta.url)))
  assert.ok(marketplacesOf(project).some(([name, repo]) => name === 'claude-plugins-official' && repo === 'anthropics/claude-plugins-official'))
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

const retired = {
  deprecated: { old: { into: 'new', reason: 'folded in', date: '2026-01-01' }, soon: { into: null, reason: 'unused', date: '2026-01-01' } },
  archived: { gone: { into: 'new', reason: 'folded in', date: '2025-01-01', archived: '2026-01-01' } },
}

test('a notice for each retired id the settings enable, naming the replacement', () => {
  const settings = { enabledPlugins: { 'old@adminhead': true, 'gone@adminhead': true, 'soon@adminhead': false, 'keep@adminhead': true, 'gone@other': true } }
  const notices = retiredNotices(settings, retired)
  assert.equal(notices.length, 2)
  assert.ok(notices[0].includes('old@adminhead') && notices[0].includes('new@adminhead'))
  assert.ok(notices[1].includes('gone@adminhead') && notices[1].includes('--prune'))
  assert.deepEqual(retiredNotices({}, retired), [])
  assert.deepEqual(retiredNotices(settings, {}), [])
})

test('prune removes archived ids only, from enabledPlugins and pluginConfigs, without mutating its input', () => {
  const settings = {
    model: 'opus',
    enabledPlugins: { 'old@adminhead': true, 'gone@adminhead': true, 'gone@other': true, 'keep@adminhead': true },
    pluginConfigs: { 'gone@adminhead': { options: { a: 1 } }, 'old@adminhead': { options: { b: 2 } } },
  }
  const before = JSON.stringify(settings)
  const { pruned, removed } = pruneArchived(settings, retired)
  assert.deepEqual(pruned.enabledPlugins, { 'old@adminhead': true, 'gone@other': true, 'keep@adminhead': true })
  assert.deepEqual(pruned.pluginConfigs, { 'old@adminhead': { options: { b: 2 } } })
  assert.equal(pruned.model, 'opus')
  assert.deepEqual(removed, ['enabledPlugins.gone@adminhead (removed)', 'pluginConfigs.gone@adminhead (removed)'])
  assert.equal(JSON.stringify(settings), before)
  assert.deepEqual(pruneArchived(settings, {}).removed, [])
})

test('merging never removes a retired id, with or without a retired list', () => {
  const user = { enabledPlugins: { 'gone@adminhead': true, 'old@adminhead': true } }
  const { merged } = mergeSettings(user, { enabledPlugins: { 'baseline@adminhead': true } })
  assert.deepEqual(Object.keys(merged.enabledPlugins), ['gone@adminhead', 'old@adminhead', 'baseline@adminhead'])
})

test('an archived id in the example is dropped before planning, a deprecated one is kept', () => {
  const ex = {
    enabledPlugins: { 'gone@adminhead': true, 'old@adminhead': true, 'off@adminhead': false },
    pluginConfigs: { 'gone@adminhead': { options: {} } },
  }
  const { example: cleaned, skipped } = withoutArchived(ex, retired)
  assert.deepEqual(skipped, ['gone@adminhead'])
  assert.deepEqual(cleaned.enabledPlugins, { 'old@adminhead': true, 'off@adminhead': false })
  assert.deepEqual(cleaned.pluginConfigs, {})
  const m = marketplacesOf(cleaned)
  assert.ok(!pluginsOf(cleaned, m).includes('gone@adminhead'))
  assert.ok(pluginsOf(cleaned, m).includes('old@adminhead'))
  assert.deepEqual(ex.enabledPlugins['gone@adminhead'], true)
})

// Runs install.mjs from a throwaway checkout with a fake `claude` that records its calls.
function runInstaller(flags, { settings, example, retiredFile }) {
  const dir = mkdtempSync(join(tmpdir(), 'install-spec-'))
  try {
    mkdirSync(join(dir, 'scripts'))
    mkdirSync(join(dir, 'examples/claude-settings'), { recursive: true })
    mkdirSync(join(dir, 'bin'))
    copyFileSync(fileURLToPath(new URL('./install.mjs', import.meta.url)), join(dir, 'scripts/install.mjs'))
    writeFileSync(join(dir, 'examples/claude-settings/settings.global.json'), JSON.stringify(example))
    if (retiredFile) writeFileSync(join(dir, 'scripts/retired.json'), JSON.stringify(retiredFile))
    const log = join(dir, 'claude.log')
    const fake = join(dir, 'bin/claude')
    writeFileSync(fake, `#!/bin/sh
echo "$@" >> "${log}"
case "$*" in
  "plugin marketplace list --json") echo '[{"name":"adminhead","installLocation":"/nonexistent"}]' ;;
  "plugin list --json") echo '[]' ;;
esac
`)
    chmodSync(fake, 0o755)
    const settingsPath = join(dir, 'settings.json')
    writeFileSync(settingsPath, JSON.stringify(settings))
    const run = spawnSync(process.execPath, [join(dir, 'scripts/install.mjs'), '--settings', settingsPath, ...flags], {
      encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, CLAUDE_CONFIG_DIR: dir },
    })
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean)
    return { run, calls, saved: JSON.parse(readFileSync(settingsPath, 'utf8')) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const userSettings = {
  enabledPlugins: { 'gone@adminhead': true, 'old@adminhead': true, 'keep@adminhead': true },
  pluginConfigs: { 'gone@adminhead': { options: { a: 1 } } },
}
const archivedExample = { enabledPlugins: { 'baseline@adminhead': true, 'gone@adminhead': true, 'old@adminhead': true } }

test('installer: notices for retired ids and no removal without --prune', () => {
  const { run, saved } = runInstaller([], { settings: userSettings, example: archivedExample, retiredFile: retired })
  assert.equal(run.status, 0, run.stderr)
  assert.ok(run.stdout.includes('gone@adminhead is archived') && run.stdout.includes('old@adminhead is deprecated'))
  assert.equal(saved.enabledPlugins['gone@adminhead'], true)
  assert.deepEqual(saved.pluginConfigs, userSettings.pluginConfigs)
})

test('installer: an archived id in the example is skipped, not installed, and does not abort', () => {
  const { run, calls, saved } = runInstaller([], { settings: {}, example: archivedExample, retiredFile: retired })
  assert.equal(run.status, 0, run.stderr)
  assert.ok(run.stdout.includes('Skipping gone@adminhead'))
  assert.ok(calls.includes('plugin install baseline@adminhead --scope user'))
  assert.ok(calls.includes('plugin install old@adminhead --scope user'))
  assert.ok(!calls.some(c => c.includes('gone@adminhead')))
  assert.ok(!('gone@adminhead' in saved.enabledPlugins))
})

test('installer: --prune removes archived ids and keeps deprecated ones', () => {
  const { run, saved } = runInstaller(['--prune'], { settings: userSettings, example: archivedExample, retiredFile: retired })
  assert.equal(run.status, 0, run.stderr)
  assert.ok(!('gone@adminhead' in saved.enabledPlugins) && !('gone@adminhead' in saved.pluginConfigs))
  assert.equal(saved.enabledPlugins['old@adminhead'], true)
  assert.equal(saved.enabledPlugins['keep@adminhead'], true)
})

test('installer: --prune --dry-run leaves the settings file alone', () => {
  const { run, saved } = runInstaller(['--prune', '--dry-run'], { settings: userSettings, example: archivedExample, retiredFile: retired })
  assert.equal(run.status, 0, run.stderr)
  assert.ok(run.stdout.includes('enabledPlugins.gone@adminhead (removed)'))
  assert.deepEqual(saved, userSettings)
})

test('installer: a checkout without retired.json retires nothing', () => {
  const { run, saved } = runInstaller(['--prune'], { settings: userSettings, example: archivedExample })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(saved.enabledPlugins['gone@adminhead'], true)
})
