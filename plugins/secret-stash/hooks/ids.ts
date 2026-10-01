export const ID_RE = /__SS_[A-Z0-9_]{1,32}_[0-9a-f]{16}__/g
export const ID_MAX_LEN = 56
export const MIN_SECRET_LEN = 8

const BLOCK = 64
// Proper prefixes of an ID: sanitized category segments, then up to 16 hex digits, then "_".
const PREFIX_RE = /^(?:_|__|__S|__SS|__SS_(?:[A-Z0-9]*|(?:[A-Z0-9]+_)+(?:[A-Z0-9]*|[0-9a-f]{1,16}_?)))$/
const enc = new TextEncoder()

export function sanitizeCategory(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_')
  return s.slice(0, 32).replace(/^_+|_+$/g, '') || 'SECRET'
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

export async function hmacSha256(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const k = new Uint8Array(BLOCK)
  k.set(key.length > BLOCK ? await sha256(key) : key)
  const inner = await sha256(concat(k.map(b => b ^ 0x36), msg))
  return sha256(concat(k.map(b => b ^ 0x5c), inner))
}

export async function makeId(key: Uint8Array, category: string, value: string): Promise<string> {
  const mac = await hmacSha256(key, enc.encode(value))
  const hex = Array.from(mac.slice(0, 8), b => b.toString(16).padStart(2, '0')).join('')
  return `__SS_${sanitizeCategory(category)}_${hex}__`
}

// True when `tail` is a proper prefix of some ID, so more text could complete it.
export function couldBeIdPrefix(tail: string): boolean {
  return tail.length < ID_MAX_LEN && PREFIX_RE.test(tail)
}

export function newKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}
