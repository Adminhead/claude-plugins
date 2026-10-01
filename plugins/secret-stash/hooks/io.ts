import type { ProcessRunResult } from 'claude-code'
import type { VaultState } from './vault.ts'

// The engine calls slice 2 needs, as plain functions. `claude plugin validate` follows `$` only
// within one file and wants each state ref spelled as a literal beside its call, so `$` can't be
// handed to these modules. A hooks file builds an Io from its own `$` instead:
//
//   const VAULT = { plugin: 'secret-stash', key: 'vault' } as const
//   const makeIo = ($: EngineInterface): Io => ({
//     sessionId: () => $.session.id(),
//     getVault: async () => (await $.state.get(VAULT)).value,
//     updateVault: change => update($, VAULT, change),
//     storeGet: key => $.store.get(key),
//     storeSet: (key, value) => $.store.set(key, value),
//     run: argv => $.process.run(argv),
//     root: () => $.session.root(),
//     exists: path => $.fs.exists(path),
//     read: path => $.fs.read(path),
//   })
export type Io = {
  sessionId(): Promise<string>
  getVault(): Promise<VaultState | undefined>
  // Atomic read-modify-write that retries on a version miss (`update` from 'claude-code').
  updateVault(change: (cur: VaultState | undefined) => VaultState): Promise<VaultState>
  storeGet(key: string): Promise<unknown>
  storeSet(key: string, value: string): Promise<void>
  run(argv: readonly string[]): Promise<ProcessRunResult>
  root(): Promise<string>
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
}
