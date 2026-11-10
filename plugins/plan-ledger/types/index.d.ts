// plan-ledger's `$.state` contract: the one named value this plugin keeps in the session.
/** The status block last handed to the model this session; `seen` is false until one has been. */
export type Injected = { seen: boolean; block: string }

declare module 'claude-code' {
  interface PluginState {
    'plan-ledger': { injected: Injected }
  }
}
