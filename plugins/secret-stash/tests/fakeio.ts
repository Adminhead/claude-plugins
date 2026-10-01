import { update } from 'claude-code'
import type { Io } from '../hooks/io.ts'
import type { VaultState } from '../hooks/vault.ts'

type RunResult = { exitCode: number; stdout: string; stderr: string }
type Runner = (argv: readonly string[]) => RunResult | Promise<RunResult>

export type FakeIo = Io & {
  calls: string[][]
  sessionId: () => Promise<string>
  setSession(id: string): void
  files: Map<string, string>
  vault(): VaultState | undefined
}

export const ok = (stdout: string): RunResult => ({ exitCode: 0, stdout, stderr: '' })
export const fail = (exitCode: number, stderr = ''): RunResult => ({ exitCode, stdout: '', stderr })

// In-memory stand-in for the engine calls. Vault writes go through the real `update` from
// 'claude-code' over a versioned state that yields between read and write, so concurrent
// writers really race and retry.
export function fakeIo(run: Runner = () => fail(1), root = '/repo'): FakeIo {
  let session = 'sess-1'
  let state: { value: VaultState | undefined; version: number } = { value: undefined, version: 0 }
  const store = new Map<string, unknown>()
  const files = new Map<string, string>()
  const calls: string[][] = []
  const dollar = {
    state: {
      get: async () => {
        await Promise.resolve()
        return { ...state }
      },
      set: async (_ref: unknown, value: VaultState, o?: { ifVersion?: number }) => {
        await Promise.resolve()
        if (o?.ifVersion !== undefined && o.ifVersion !== state.version) return { isSet: false, version: state.version }
        state = { value, version: state.version + 1 }
        return { isSet: true, version: state.version }
      },
    },
  }
  return {
    calls,
    files,
    setSession: id => void (session = id),
    vault: () => state.value,
    sessionId: async () => session,
    getVault: async () => state.value,
    updateVault: change => update(dollar as never, { plugin: 'secret-stash', key: 'vault' } as never, change as never) as Promise<VaultState>,
    storeGet: async k => store.get(k),
    storeSet: async (k, v) => void store.set(k, v),
    run: async argv => {
      calls.push([...argv])
      return run(argv)
    },
    root: async () => root,
    exists: async p => files.has(p),
    read: async p => {
      const f = files.get(p)
      if (f === undefined) throw new Error(`no such file ${p}`)
      return f
    },
  }
}

// `printenv NAME` over a plain object; `pass-cli item view REF` over a map of refs.
export function runner(env: Record<string, string> = {}, pass: Record<string, RunResult> = {}): Runner {
  return argv => {
    if (argv[0] === 'printenv') return argv[1] in env ? ok(env[argv[1]] + '\n') : fail(1)
    if (argv[0] === 'pass-cli') return pass[argv[3]] ?? fail(1, 'no such item')
    throw new Error(`unexpected command ${argv.join(' ')}`)
  }
}
