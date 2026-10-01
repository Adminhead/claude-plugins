import type { PluginOptions } from 'claude-code'
import { loadConfig, type Config } from './config.ts'
import { customDetector } from './detectors/custom.ts'
import { envRuleDetector } from './detectors/envrule.ts'
import { pemDetector } from './detectors/pem.ts'
import { openredactionDetector } from './detectors/openredaction.ts'
import { literalDetector } from './detect.ts'
import type { Io } from './io.ts'
import { ensureLoaded, loadKey, type Vault } from './vault.ts'
import type { Detector } from './types.ts'

export type Ctx = { config: Config; key: Uint8Array; vault: Vault; detectors: Detector[] }

// Config-derived detectors are costly to build (the library's pattern list), so the last set is
// kept until the project config changes.
let built: { project: string; detectors: Detector[] } | undefined

function configDetectors(config: Config): Detector[] {
  const project = JSON.stringify(config.project)
  if (built?.project === project) return built.detectors
  const { openredaction: o, envKeyRule } = config.project
  const detectors = [
    ...(envKeyRule ? [envRuleDetector()] : []),
    pemDetector(),
    customDetector(o.customPatterns, o.whitelist),
    openredactionDetector(o),
  ]
  built = { project, detectors }
  return detectors
}

// Everything a hook needs to redact or restore. Throws ConfigInvalid for a bad config.
export async function loadCtx(io: Io, options: PluginOptions): Promise<Ctx> {
  const config = await loadConfig(io, options)
  const vault = await ensureLoaded(io, config)
  const key = await loadKey(io)
  return { config, key, vault, detectors: [literalDetector(vault.literals(), 'vault'), ...configDetectors(config)] }
}
