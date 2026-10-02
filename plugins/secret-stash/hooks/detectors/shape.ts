// A lowercase kebab or snake identifier with at least two plain-word segments (`k8s-manifest-generator`,
// `api_key_rotation`). Directory, skill and tool names look like this. A segment may carry a digit
// only when it is 3 characters or fewer and holds a letter (`k8s`, `ec2`); `battery7`, `ab1c` or a bare `7` marks a passphrase or token.
function isWordSlug(value: string): boolean {
  const segments = value.split(/[-_]/)
  if (!segments.every(s => /^[a-z]+$/.test(s) || /^(?=[0-9]*[a-z])[a-z0-9]{1,3}$/.test(s))) return false
  return segments.filter(s => /^[a-z]{4,}$/.test(s)).length >= 2
}

// Prose check, applied when whitespace or `:` separates a key word from its value (`secret: denied`
// is an error message, `pass-cli:pass-cli` a tool name); `=` marks an assignment, where the match
// stands. Words, identifiers and call syntax are not secrets. A value passes when it has a digit or
// a symbol (`-_.` do not count) and is not a word slug. A long letters-only value passes when it
// mixes case. This misses a short passphrase made of letters only, and still stashes a prose word
// with a digit or symbol (`utf8mb4_bin`). The `.env` key rule covers `key: value` lines.
export function looksLikeSecret(value: string): boolean {
  if (/[A-Za-z_]\w*\(\)|\]\(/.test(value) || isWordSlug(value)) return false
  if (/[^A-Za-z\-_.]/.test(value)) return true
  return value.length >= 20 && /[a-z]/.test(value) && /[A-Z]/.test(value)
}
