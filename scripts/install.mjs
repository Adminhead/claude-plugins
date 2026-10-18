#!/usr/bin/env node
// Installs the adminhead marketplace from GitHub and merges examples/claude-settings/settings.global.json
// into the user's Claude Code settings. No npm dependencies; needs Node 18+ and `claude` on PATH.
// Plugins the example sets to false are installed and disabled once, if they are installed nowhere and the
// user has not enabled them; a rerun neither updates nor re-disables an installed off plugin.
//
//   node scripts/install.mjs [--dry-run] [--no-settings] [--no-plugins] [--settings PATH]
//   curl -fsSL <raw url of this file> | node --input-type=module - [OPTIONS]

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'Adminhead/claude-plugins'
const EXAMPLE = 'examples/claude-settings/settings.global.json'
const DEFAULT_PLUGINS = ['baseline@adminhead']
const BUILTIN_MARKETPLACE = 'claude-plugins-official'

// Piped into `node -`, there is no checkout around the script: argv[1] is "-" and import.meta.url
// names a virtual file in the current directory.
const PIPED = process.argv[1] === '-'

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// Merges `example` into `current`: example scalars win, objects merge key by key, arrays keep the
// current items and append the example's missing ones, and keys only `current` has stay. The one
// exception: an installed-but-off plugin id in `keep` (see offPluginsOf) that `current` already sets
// keeps the user's value, so a rerun never turns it off again. Returns the merged object and the
// dotted paths that changed.
export function mergeSettings(current, example, keep = new Set(), path = []) {
  const out = { ...current }
  const changes = []
  for (const [key, value] of Object.entries(example)) {
    const at = [...path, key].join('.')
    const have = current[key]
    if (path.join('.') === 'enabledPlugins' && keep.has(key) && have !== undefined) continue
    if (isObject(value) && isObject(have)) {
      const sub = mergeSettings(have, value, keep, [...path, key])
      out[key] = sub.merged
      changes.push(...sub.changes)
    } else if (Array.isArray(value) && Array.isArray(have)) {
      const seen = new Set(have.map(v => JSON.stringify(v)))
      const added = value.filter(v => !seen.has(JSON.stringify(v)))
      if (added.length) {
        out[key] = [...have, ...added]
        changes.push(`${at} (+${added.length})`)
      }
    } else if (JSON.stringify(have) !== JSON.stringify(value)) {
      out[key] = value
      changes.push(have === undefined ? `${at} (added)` : `${at} (changed)`)
    }
  }
  return { merged: out, changes }
}

// The GitHub marketplaces the example declares, as [name, repo], adminhead first.
export function marketplacesOf(example) {
  const known = Object.entries(example.extraKnownMarketplaces ?? {})
    .filter(([, m]) => m?.source?.source === 'github' && typeof m.source.repo === 'string')
    .map(([name, m]) => [name, m.source.repo])
  if (!known.some(([name]) => name === 'adminhead')) known.unshift(['adminhead', REPO])
  return known.sort(([a], [b]) => (a === 'adminhead' ? -1 : b === 'adminhead' ? 1 : 0))
}

// The plugins to install at user scope: baseline, plus each plugin the example enables from one of
// those marketplaces (built-in and synced plugins need no install).
export function pluginsOf(example, marketplaces) {
  const enabled = Object.entries(example.enabledPlugins ?? {})
    .filter(([id, on]) => on === true && installableFrom(id, marketplaces))
    .map(([id]) => id)
  return [...new Set([...DEFAULT_PLUGINS, ...enabled])]
}

// Plugins the example lists as false from an installable marketplace: installed once, then left off.
export function offPluginsOf(example, marketplaces) {
  return Object.entries(example.enabledPlugins ?? {})
    .filter(([id, on]) => on === false && installableFrom(id, marketplaces))
    .map(([id]) => id)
}

// claude-plugins-official is not declared by the example; the installer adds it when it is missing.
function installableFrom(id, marketplaces) {
  const name = id.split('@')[1]
  return name === BUILTIN_MARKETPLACE || marketplaces.some(([n]) => n === name)
}

// What the plugin step does. `installedUser` and `installedAny` are plugin ids installed at user scope
// and at any scope; `userSettings` is the user's settings read before the merge. `main` plugins are
// installed or updated at user scope. `off` plugins are installed and then disabled, only when they
// are installed nowhere and the user has not set them to true.
export function planPlugins(example, marketplaces, installedUser, installedAny, userSettings) {
  const main = pluginsOf(example, marketplaces).map(id => ({ id, action: installedUser.has(id) ? 'update' : 'install' }))
  const off = offPluginsOf(example, marketplaces)
    .filter(id => !installedAny.has(id) && userSettings?.enabledPlugins?.[id] !== true)
  return { main, off }
}

// True when a planned plugin comes from claude-plugins-official and that marketplace is not registered.
export function needsOfficialMarketplace(plan, knownMarketplaces) {
  const suffix = `@${BUILTIN_MARKETPLACE}`
  return [...plan.main.map(p => p.id), ...plan.off].some(id => id.endsWith(suffix)) && !knownMarketplaces.includes(BUILTIN_MARKETPLACE)
}

function parseArgs(argv) {
  const args = { dryRun: false, settings: true, plugins: true, settingsPath: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--no-settings') args.settings = false
    else if (a === '--no-plugins') args.plugins = false
    else if (a === '--settings') args.settingsPath = argv[++i]
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/install.mjs [--dry-run] [--no-settings] [--no-plugins] [--settings PATH]\n' +
        '       curl -fsSL <url> | node --input-type=module - [OPTIONS]')
      process.exit(0)
    } else throw new Error(`unknown option ${a}`)
  }
  return args
}

function claude(args, { dryRun, capture = false } = {}) {
  if (dryRun && !capture) {
    console.log(`  would run: claude ${args.join(' ')}`)
    return { status: 0, stdout: '' }
  }
  const r = spawnSync('claude', args, { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
  if (r.error) throw new Error(r.error.code === 'ENOENT' ? 'claude is not on PATH; install Claude Code first' : r.error.message)
  return r
}

function listJson(args) {
  const r = claude([...args, '--json'], { capture: true })
  if (r.status !== 0) throw new Error(`claude ${args.join(' ')} failed: ${r.stderr.trim()}`)
  return JSON.parse(r.stdout)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Error(`cannot read ${path} as JSON: ${e.message}`)
  }
}

// The example from this checkout when the script runs from one, else from the marketplace clone.
function loadExample(installLocation) {
  const local = join(dirname(fileURLToPath(import.meta.url)), '..', EXAMPLE)
  if (!PIPED && existsSync(local)) return [local, readJson(local)]
  if (installLocation && existsSync(join(installLocation, EXAMPLE))) {
    const path = join(installLocation, EXAMPLE)
    return [path, readJson(path)]
  }
  throw new Error(`cannot find ${EXAMPLE}; run this script from a checkout or after the marketplace is added`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  const settingsPath = args.settingsPath || join(configDir, 'settings.json')

  // 1. Marketplaces. The example names them; adminhead comes first so its clone can supply the example.
  const have = new Map(listJson(['plugin', 'marketplace', 'list']).map(m => [m.name, m]))
  const bootstrap = [['adminhead', REPO]]
  let [examplePath, example] = (() => {
    try {
      return loadExample(have.get('adminhead')?.installLocation)
    } catch {
      return [null, null]
    }
  })()
  const marketplaces = example ? marketplacesOf(example) : bootstrap
  console.log('Marketplaces:')
  for (const [name, repo] of marketplaces) {
    const r = have.has(name)
      ? claude(['plugin', 'marketplace', 'update', name], args)
      : claude(['plugin', 'marketplace', 'add', repo, '--scope', 'user'], args)
    if (r.status !== 0) throw new Error(`could not add or update the ${name} marketplace (${repo})`)
  }
  if (!example && args.dryRun) {
    console.log('\nDry run: the settings and plugin steps need the marketplace clone; run without --dry-run, or from a checkout, to see them.')
    return
  }
  if (!example) {
    const added = new Map(listJson(['plugin', 'marketplace', 'list']).map(m => [m.name, m]))
    ;[examplePath, example] = loadExample(added.get('adminhead')?.installLocation)
    for (const [name, repo] of marketplacesOf(example).filter(([n]) => !added.has(n))) {
      if (claude(['plugin', 'marketplace', 'add', repo, '--scope', 'user'], args).status !== 0) {
        throw new Error(`could not add the ${name} marketplace (${repo})`)
      }
    }
  }

  // 2. Settings: merge, never overwrite, so hooks other installers wrote stay.
  // Under --no-settings the file is only read for planning, so a missing, corrupt or non-object one counts as empty.
  let current = {}
  try {
    if (existsSync(settingsPath)) current = readJson(settingsPath)
    if (!isObject(current)) throw new Error(`${settingsPath} is not a JSON object`)
  } catch (e) {
    if (args.settings) throw e
    current = {}
  }
  if (args.settings) {
    const { merged, changes } = mergeSettings(current, example, new Set(offPluginsOf(example, marketplaces)))
    console.log(`\nSettings: ${examplePath} -> ${settingsPath}`)
    if (!changes.length) console.log('  already up to date')
    for (const c of changes) console.log(`  ${c}`)
    if (changes.length && !args.dryRun) {
      mkdirSync(dirname(settingsPath), { recursive: true })
      if (existsSync(settingsPath)) {
        const backup = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
        copyFileSync(settingsPath, backup)
        console.log(`  backup: ${backup}`)
      }
      const tmp = `${settingsPath}.tmp-${process.pid}`
      writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`)
      renameSync(tmp, settingsPath)
    }
  }

  // 3. Plugins at user scope: install the missing ones, update the rest.
  if (args.plugins) {
    const list = listJson(['plugin', 'list'])
    const plan = planPlugins(
      example,
      marketplaces,
      new Set(list.filter(p => p.scope === 'user').map(p => p.id)),
      new Set(list.map(p => p.id)),
      current,
    )
    // Claude Code registers claude-plugins-official only on an interactive start, so add it when a plugin needs it.
    const known = listJson(['plugin', 'marketplace', 'list']).map(m => m.name)
    if (needsOfficialMarketplace(plan, known)) {
      console.log('\nMarketplaces:')
      if (claude(['plugin', 'marketplace', 'add', 'anthropics/claude-plugins-official', '--scope', 'user'], args).status !== 0) {
        throw new Error(`could not add the ${BUILTIN_MARKETPLACE} marketplace`)
      }
    }
    console.log('\nPlugins (user scope):')
    for (const { id, action } of plan.main) {
      if (claude(['plugin', action, id, '--scope', 'user'], args).status !== 0) throw new Error(`could not install or update ${id}`)
    }
    // Installed-but-off plugins: installed once and then left to the user, so a rerun never updates or re-disables them.
    for (const id of plan.off) {
      if (claude(['plugin', 'install', id, '--scope', 'user'], args).status !== 0) throw new Error(`could not install ${id}`)
      if (claude(['plugin', 'disable', id, '--scope', 'user'], args).status !== 0) {
        console.error(`  ${id} is installed but still enabled; turn it off with: claude plugin disable ${id} --scope user`)
        process.exitCode = 1
      }
    }
  }

  console.log(args.dryRun ? '\nDry run: nothing changed.' : '\nDone. Restart Claude Code, or run /reload-plugins in an open session.')
}

if (PIPED || (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])) {
  try {
    main()
  } catch (e) {
    console.error(`install: ${e.message}`)
    process.exit(1)
  }
}
