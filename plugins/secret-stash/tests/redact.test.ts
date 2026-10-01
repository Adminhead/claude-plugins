import { describe, test, expect } from 'claude-code/testing'
import { literalDetector } from '../hooks/detect.ts'
import { ID_RE } from '../hooks/ids.ts'
import { DeadlineExceeded, redactBlocks, redactDeep, redactText } from '../hooks/redact.ts'
import { restoreText } from '../hooks/restore.ts'
import type { Detector } from '../hooks/types.ts'
import { ctx, regexDetector } from './helpers.ts'

const aws = regexDetector(/AKIA[0-9A-Z]{16}/g, 'AWS_ACCESS_KEY')
const KEY1 = 'AKIAIOSFODNN7EXAMPLE'

describe('redactText', () => {
  test('replaces secrets with deterministic IDs and reports them', async () => {
    const c = ctx([aws])
    const a = await redactText(`k=${KEY1} and ${KEY1}`, c)
    const b = await redactText(`k=${KEY1} and ${KEY1}`, c)
    expect(a).toEqual(b)
    expect(a.text).not.toContain(KEY1)
    expect(a.found).toHaveLength(1)
    expect(a.found[0]).toMatchObject({ value: KEY1, category: 'AWS_ACCESS_KEY' })
    expect(a.text).toBe(`k=${a.found[0].id} and ${a.found[0].id}`)
  })

  test('text with no secret is returned as is', async () => {
    expect(await redactText('nothing here', ctx([aws]))).toEqual({ text: 'nothing here', found: [] })
  })

  test('is idempotent, even with a hex detector', async () => {
    const c = ctx([aws, regexDetector(/[0-9a-f]{16}/g, 'HEX')])
    const once = await redactText(`k=${KEY1}`, c)
    const twice = await redactText(once.text, c)
    expect(twice).toEqual({ text: once.text, found: [] })
  })

  test('idFor wins over makeId across categories', async () => {
    const first = await redactText(KEY1, ctx([aws]))
    const other = regexDetector(/AKIA[0-9A-Z]{16}/g, 'OTHER')
    const c = ctx([other], { idFor: v => (v === KEY1 ? first.found[0].id : undefined) })
    const again = await redactText(KEY1, c)
    expect(again.text).toBe(first.text)
  })

  test('a restored value re-redacts to the same ID through a literal detector', async () => {
    const first = await redactText(`env: DB=${KEY1}`, ctx([aws]))
    const { id, value, category } = first.found[0]
    const c = ctx([literalDetector([{ value, category }])], { idFor: v => (v === value ? id : undefined) })
    const restored = restoreText(`echo ${id}`, i => (i === id ? value : undefined))
    expect(restored).toBe(`echo ${KEY1}`)
    expect((await redactText(restored, c)).text).toBe(`echo ${id}`)
  })

  test('an expired deadline throws DeadlineExceeded', async () => {
    const c = ctx([aws], { deadline: Date.now() - 1 })
    await expect(redactText(KEY1, c)).rejects.toThrow(DeadlineExceeded)
  })

  test('a deadline that passes mid-scan stops before the next detector', async () => {
    let second = 0
    const c = ctx([])
    c.detectors = [
      { source: 'custom', detect: () => { c.deadline = 0; return [] } },
      { source: 'custom', detect: () => { second++; return [] } },
    ]
    await expect(redactText('x'.repeat(200_000), c)).rejects.toThrow(DeadlineExceeded)
    expect(second).toBe(0)
  })

  test('a 1.7 KB multi-line match in a large text is redacted whole', async () => {
    const pem = '-----BEGIN PRIVATE KEY-----\n' + ('MIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n'.repeat(50)) + '-----END PRIVATE KEY-----'
    const text = 'x'.repeat(64 * 1024 - 1024 - 100) + pem + 'y'.repeat(100_000)
    const d = regexDetector(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g, 'PEM')
    const r = await redactText(text, ctx([d]))
    expect(r.found).toHaveLength(1)
    expect(r.found[0].value).toBe(pem)
    expect(r.text).not.toContain('MIIEvQ')
  })

  test('a long greedy run is redacted whole', async () => {
    const run = 'q'.repeat(1500)
    const text = 'x '.repeat(32 * 1024 - 600) + run + ' tail'
    const r = await redactText(text, ctx([regexDetector(/q{8,}/g, 'RUN')]))
    expect(r.found.map(f => f.value)).toEqual([run])
    expect(r.text).not.toContain('qqqqqqqq')
  })

  test('overlapping matches merge, so no part of a secret leaks', async () => {
    const lit = literalDetector([{ value: 'SECRETPART1234', category: 'LIT' }], 'registered')
    const r = await redactText('v=SECRETPART1234abc end', ctx([lit, regexDetector(/PART1234[a-z]+/g, 'RX')]))
    expect(r.found).toHaveLength(1)
    expect(r.found[0]).toMatchObject({ value: 'SECRETPART1234abc', category: 'LIT' })
    expect(r.text).toBe(`v=${r.found[0].id} end`)
  })

  test('a partial overlap with a vault literal leaves no fragment', async () => {
    const lit = literalDetector([{ value: 'SECRETPART1234', category: 'GEN' }], 'vault')
    const text = 'SECRETPART1234abcdefghijklmnop'
    const r = await redactText(text, ctx([lit, regexDetector(/PART1234[a-z]+/g, 'RX')]))
    expect(r.text).toBe(r.found[0].id)
    expect(r.found[0].value).toBe(text)
  })

  test('the fragment left beside an ID under 8 chars is still redacted', async () => {
    const id = (await redactText(KEY1, ctx([aws]))).found[0].id
    const r = await redactText(`tok=${id}`, ctx([regexDetector(/tok=[A-Za-z0-9_]+/g, 'TOK')]))
    expect(r.found.map(f => f.value)).toEqual(['tok='])
    expect(r.text).not.toContain('tok=')
    expect(r.text.endsWith(id)).toBe(true)
  })

  test('partial overlaps on each side and a chain each yield one ID and no leftovers', async () => {
    const a = regexDetector(/aaaaaaaa1111/g, 'A')
    const b = regexDetector(/1111 bbbbbbbb/g, 'B')
    const c = regexDetector(/bbbbbbbb2222/g, 'C')
    const cases: [string, ReturnType<typeof regexDetector>[]][] = [
      ['aaaaaaaa1111 bbbbbbbb', [a, b]],
      ['aaaaaaaa1111 bbbbbbbb', [b, a]],
      ['aaaaaaaa1111 bbbbbbbb2222', [a, b, c]],
    ]
    for (const [text, ds] of cases) {
      const r = await redactText(`[${text}]`, ctx(ds))
      expect(r.found).toHaveLength(1)
      expect(r.found[0].value).toBe(text)
      expect(r.text).toBe(`[${r.found[0].id}]`)
    }
  })

  test('a match cut by an ID on the left, right, or both sides keeps the ID and redacts the rest', async () => {
    const id = (await redactText(KEY1, ctx([aws]))).found[0].id
    const any = regexDetector(/[A-Za-z0-9_=]+/g, 'ANY')
    const c = ctx([any])
    for (const text of [`ab${id}`, `${id}ab`, `ab${id}cd`]) {
      const r = await redactText(text, c)
      const ids = r.text.match(ID_RE)!
      expect(r.text).toContain(id)
      expect(r.text).not.toMatch(/ab|cd/)
      expect(ids).toHaveLength(text.includes('cd') ? 3 : 2)
      expect(await redactText(r.text, c)).toEqual({ text: r.text, found: [] })
    }
  })

  test('a single match over 64 KB is fully redacted', async () => {
    const big = 'k'.repeat(100_000)
    const r = await redactText(`head ${big} tail`, ctx([regexDetector(/k+/g, 'BIG')]))
    expect(r.found.map(f => f.value)).toEqual([big])
    expect(r.text).toBe(`head ${r.found[0].id} tail`)
  })

  test('every occurrence of a value found through context gets the same ID', async () => {
    const env: Detector = {
      source: 'env',
      detect: text => [...text.matchAll(/API_KEY=(\S+)/g)].map(m => ({
        start: m.index + 8, end: m.index + m[0].length, category: 'ENV', source: 'env' as const,
      })),
    }
    const text = 'API_KEY=abcdefgh12345\ncurl -H "X-Key: abcdefgh12345"'
    const c = ctx([env])
    const r = await redactText(text, c)
    const id = r.found[0].id
    expect(r.found).toHaveLength(1)
    expect(r.text).toBe(`API_KEY=${id}\ncurl -H "X-Key: ${id}"`)
    expect(await redactText(text, c)).toEqual(r)
  })

  test('a match touching an existing ID redacts the rest and keeps the ID', async () => {
    const first = await redactText(KEY1, ctx([aws]))
    const id = first.found[0].id
    const tok = regexDetector(/tok=[A-Za-z0-9_]+/g, 'TOK')
    const r = await redactText(`tok=${KEY1}${id} end`, ctx([tok, aws]))
    expect(r.text).not.toContain(KEY1)
    expect(r.text.endsWith(`${id} end`)).toBe(true)
    expect(r.text.match(ID_RE)).toHaveLength(2)
    const again = await redactText(r.text, ctx([tok, aws]))
    expect(again).toEqual({ text: r.text, found: [] })
  })
})

describe('redactBlocks', () => {
  test('rewrites text and tool_result content only', async () => {
    const image = { type: 'image', source: { data: KEY1 } }
    const toolUse = { type: 'tool_use', id: 't1', name: 'Bash', input: { command: `echo ${KEY1}` } }
    const blocks = [
      { type: 'text', text: `a ${KEY1}` },
      toolUse,
      image,
      { type: 'tool_result', tool_use_id: 't1', content: `out ${KEY1}` },
      { type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: KEY1 }, image] },
    ]
    const r = await redactBlocks(blocks, ctx([aws]))
    const id = r.found[0].id
    expect(r.found).toHaveLength(1)
    expect(r.blocks[0]).toEqual({ type: 'text', text: `a ${id}` })
    expect(r.blocks[1]).toBe(toolUse)
    expect(r.blocks[2]).toBe(image)
    expect(r.blocks[3]).toEqual({ type: 'tool_result', tool_use_id: 't1', content: `out ${id}` })
    expect(r.blocks[4]).toEqual({ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: id }, image] })
  })
})

describe('redactDeep', () => {
  test('redacts nested strings without mutating input', async () => {
    const input = Object.freeze({ a: [KEY1, { b: KEY1, n: 3 }], k: null })
    const r = await redactDeep(input, ctx([aws]))
    const id = r.found[0].id
    expect(r.value).toEqual({ a: [id, { b: id, n: 3 }], k: null })
    expect(input.a[0]).toBe(KEY1)
    expect(JSON.stringify(r.value).match(ID_RE)).toHaveLength(2)
  })
})
