export type SecretStashEntry = { value: string; category: string }
export type SecretStashVault = { loadedFor: string; entries: Record<string, SecretStashEntry> }

declare module 'claude-code' {
  interface PluginState {
    'secret-stash': { vault: SecretStashVault }
  }
}
