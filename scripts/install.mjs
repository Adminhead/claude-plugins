#!/usr/bin/env node
// Installs the adminhead marketplace from GitHub and merges examples/claude-settings/settings.global.json
// into the user's Claude Code settings. No npm dependencies; needs Node 18+ and `claude` on PATH.
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

// Piped into `node -`, there is no checkout around the script: argv[1] is "-" and import.meta.url
// names a virtual file in the current directory.
const PIPED = process.argv[1] === '-'

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// Merges `example` into `current`: example scalars win, objects merge key by key, arrays keep the
// current items and append the example's missing ones, and keys only `current` has stay. Returns the
// merged object and the dotted paths that changed.
export function mergeSettings(current, example, path = []) {
  const out = { ...current }
  const changes = []
  for (const [key, value] of Object.entries(example)) {
    const at = [...path, key].join('.')
    const have = current[key]
    if (isObject(value) && isObject(have)) {
      const sub = mergeSettings(have, value, [...path, key])
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
  const names = new Set(marketplaces.map(([name]) => name))
  const enabled = Object.entries(example.enabledPlugins ?? {})
    .filter(([id, on]) => on === true && names.has(id.split('@')[1]))
    .map(([id]) => id)
  return [...new Set([...DEFAULT_PLUGINS, ...enabled])]
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
  if (args.settings) {
    const current = existsSync(settingsPath) ? readJson(settingsPath) : {}
    if (!isObject(current)) throw new Error(`${settingsPath} is not a JSON object`)
    const { merged, changes } = mergeSettings(current, example)
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
    const installed = new Set(listJson(['plugin', 'list']).filter(p => p.scope === 'user').map(p => p.id))
    console.log('\nPlugins (user scope):')
    for (const id of pluginsOf(example, marketplaces)) {
      const r = installed.has(id)
        ? claude(['plugin', 'update', id, '--scope', 'user'], args)
        : claude(['plugin', 'install', id, '--scope', 'user'], args)
      if (r.status !== 0) throw new Error(`could not install or update ${id}`)
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
