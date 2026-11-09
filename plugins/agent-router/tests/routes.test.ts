import { describe, expect, test } from 'claude-code/testing'
import { DEFAULT_LIMITS, HEADING, hiddenOf, isOrchestrator, limitsOf, MAX_AGENTS, MAX_DESCRIPTION, renderTable, selectRows, summarize, withTable } from '../hooks/routes'

const offer = (agent: string, description = `Does ${agent} work.`) => ({ agent, description, source: 'plugin', provider: 'x' })

describe('routes', () => {
  test('isOrchestrator matches bare and plugin-scoped names only', () => {
    expect(isOrchestrator('orchestration')).toBe(true)
    expect(isOrchestrator('orchestration:orchestration')).toBe(true)
    expect(isOrchestrator('other:orchestration')).toBe(true)
    expect(isOrchestrator('orchestration:coder')).toBe(false)
    expect(isOrchestrator('my-orchestration')).toBe(false)
    expect(isOrchestrator(undefined)).toBe(false)
    expect(isOrchestrator('')).toBe(false)
  })

  test('summarize flattens and truncates at a word boundary', () => {
    expect(summarize('One\n\nline\tonly.')).toBe('One line only.')
    const long = 'word '.repeat(200)
    const s = summarize(long)
    expect(s.length <= MAX_DESCRIPTION).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    expect(s.includes('  ')).toBe(false)
  })

  test('MAX_DESCRIPTION keeps a 320-character description whole and cuts a longer one', () => {
    expect(MAX_DESCRIPTION).toBe(320)
    const exact = 'x'.repeat(320)
    expect(summarize(exact)).toBe(exact)
    const over = `${'word '.repeat(63)}tail end`
    const s = summarize(over)
    expect(s.length <= 320).toBe(true)
    expect(s.length > 220).toBe(true)
    expect(s.endsWith('…')).toBe(true)
  })

  test('selectRows sorts, drops the orchestrator, helpers and unsafe names', () => {
    const { rows } = selectRows([
      offer('reviewer:reviewer'),
      offer('orchestration:orchestration'),
      offer('statusline-setup'),
      offer('codebase-memory'),
      offer('codebase-memory-scout'),
      offer('codebase-memory-auditor'),
      offer('Explore'),
      offer('bad name`'),
      offer('coder:coder'),
    ])
    expect(rows.map((r) => r.agent)).toEqual(['Explore', 'coder:coder', 'reviewer:reviewer'])
  })

  test('selectRows bounds the count and reports what it dropped', () => {
    const many = Array.from({ length: MAX_AGENTS + 5 }, (_, i) => offer(`p:a${String(i).padStart(2, '0')}`))
    const { rows, omitted } = selectRows(many)
    expect(rows.length).toBe(MAX_AGENTS)
    expect(omitted).toBe(5)
    expect(renderTable(many)).toContain('(5 more installed types not listed)')
  })

  test('renderTable is stable regardless of offer order and null when empty', () => {
    const a = [offer('b:b'), offer('a:a')]
    expect(renderTable(a)).toBe(renderTable([...a].reverse()))
    expect(renderTable([])).toBeNull()
    expect(renderTable([offer('orchestration:orchestration')])).toBeNull()
    expect(renderTable(a)).toContain('- `a:a`: Does a:a work.')
  })

  test('withTable appends once and replaces an earlier copy', () => {
    const t1 = renderTable([offer('a:a')])
    const t2 = renderTable([offer('b:b')])
    const once = withTable('Launch an agent.', t1)
    expect(once.startsWith('Launch an agent.\n\n' + HEADING)).toBe(true)
    const twice = withTable(once, t2)
    expect(twice).toBe(withTable('Launch an agent.', t2))
    expect(withTable(once, null)).toBe('Launch an agent.')
  })
})

describe('limits', () => {
  const many = ['alpha', 'bravo', 'charlie', 'delta', 'reviewer'].map((a) => offer(a, 'x '.repeat(300)))

  test('defaults give the same output as the one-argument call', () => {
    expect(renderTable(many, DEFAULT_LIMITS)).toBe(renderTable(many))
    expect(selectRows(many, limitsOf({}))).toEqual(selectRows(many))
    expect(limitsOf(undefined)).toEqual(DEFAULT_LIMITS)
  })

  test('maxAgents lists that many rows and reports the rest as omitted', () => {
    const { rows, omitted } = selectRows(many, limitsOf({ maxAgents: 2 }))
    expect(rows.map((r) => r.agent)).toEqual(['alpha', 'bravo'])
    expect(omitted).toBe(3)
  })

  test('hidden drops that type', () => {
    const { rows } = selectRows(many, { ...DEFAULT_LIMITS, hidden: new Set(['reviewer']) })
    expect(rows.map((r) => r.agent)).toEqual(['alpha', 'bravo', 'charlie', 'delta'])
  })

  test('descriptionChars shortens each row', () => {
    const { rows } = selectRows(many, limitsOf({ descriptionChars: 50 }))
    expect(rows.every((r) => r.when.length <= 50)).toBe(true)
  })

  test('a missing or unreadable number keeps the default, out-of-range values clamp', () => {
    for (const v of [undefined, '', 'abc', NaN, null]) {
      expect(limitsOf({ maxAgents: v, descriptionChars: v }).maxAgents).toBe(30)
      expect(limitsOf({ maxAgents: v, descriptionChars: v }).descriptionChars).toBe(320)
    }
    expect(limitsOf({ maxAgents: 0 }).maxAgents).toBe(1)
    expect(limitsOf({ maxAgents: '1e400' }).maxAgents).toBe(100)
    expect(limitsOf({ descriptionChars: 5 }).descriptionChars).toBe(40)
    expect(limitsOf({ descriptionChars: 99999 }).descriptionChars).toBe(1000)
    expect(limitsOf({ maxAgents: 2.9 }).maxAgents).toBe(2)
  })

  test('hideAgents splits on commas and spaces, drops invalid names, and ignores long or non-string values', () => {
    expect([...hiddenOf('a, b  c,d')].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect([...hiddenOf('good,bad name!,`x`,ok:2')].sort()).toEqual(['bad', 'good', 'ok:2'])
    expect(limitsOf({ hideAgents: 'a'.repeat(5000) }).hidden.size).toBe(0)
    for (const v of [undefined, 5, true, null, ['a'], { a: 1 }]) expect(hiddenOf(v).size).toBe(0)
  })
})
