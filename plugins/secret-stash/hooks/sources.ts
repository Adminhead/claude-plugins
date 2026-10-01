import { ConfigInvalid, type Config, type ConfigError } from './config.ts'
import { MIN_SECRET_LEN } from './ids.ts'
import type { Io } from './io.ts'

// A registered value and the name its category derives from (`REG_<name>`).
export type Registered = { name: string; value: string }

const dropNewline = (s: string) => (s.endsWith('\n') ? s.slice(0, -1) : s)

// `$.env.get` needs a literal name, and these names come from config, so read through printenv.
// The names are validated as identifiers in config.ts, so none can pass as an option.
async function readEnv(io: Io, name: string): Promise<string | ConfigError> {
  const path = `env ${name}`
  let r
  try {
    r = await io.run(['printenv', name])
  } catch (err) {
    return { path, message: `could not run printenv: ${(err as Error).message}` }
  }
  if (r.exitCode !== 0) return { path, message: 'environment variable is not set' }
  return dropNewline(r.stdout)
}

async function readPass(io: Io, ref: string): Promise<string | ConfigError> {
  const path = `pass ${ref}`
  let r
  try {
    r = await io.run(['pass-cli', 'item', 'view', ref])
  } catch (err) {
    return { path, message: `could not run pass-cli: ${(err as Error).message}` }
  }
  if (r.exitCode !== 0) {
    // stderr is left out: it could carry item content, and these messages reach toasts and the status line.
    return { path, message: `pass-cli failed (exit ${r.exitCode})` }
  }
  return dropNewline(r.stdout)
}

// Resolves every registered source: userConfig and project-file env names, then pass:// refs.
// A missing variable, a pass-cli failure or a value under MIN_SECRET_LEN fails the whole load, all
// errors together, because a value left out would go to the model in the clear. Messages never
// carry a value.
export async function resolveRegistered(io: Io, cfg: Config): Promise<Registered[]> {
  const envNames = [...new Set([...cfg.envVars, ...cfg.project.env])]
  const wanted = [
    ...envNames.map(name => ({ name, read: () => readEnv(io, name) })),
    ...cfg.project.pass.map(ref => ({ name: ref.slice(ref.lastIndexOf('/') + 1), read: () => readPass(io, ref) })),
  ]
  const values = await Promise.all(wanted.map(w => w.read()))
  const errors: ConfigError[] = []
  const out: Registered[] = []
  values.forEach((v, i) => {
    if (typeof v !== 'string') return void errors.push(v)
    if (v.length < MIN_SECRET_LEN) {
      const path = i < envNames.length ? `env ${wanted[i].name}` : `pass ${cfg.project.pass[i - envNames.length]}`
      return void errors.push({ path, message: `value is ${v.length} characters, under the ${MIN_SECRET_LEN} minimum` })
    }
    out.push({ name: wanted[i].name, value: v })
  })
  if (errors.length) throw new ConfigInvalid(errors)
  return out
}
