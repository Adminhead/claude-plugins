export function isPlain(x: unknown): x is Record<string, unknown> {
  if (typeof x !== 'object' || x === null) return false
  const p = Object.getPrototypeOf(x)
  return p === Object.prototype || p === null
}
