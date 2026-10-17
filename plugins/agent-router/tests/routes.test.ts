import { describe, expect, test } from 'claude-code/testing'
import { HEADING, isOrchestrator, MAX_AGENTS, MAX_DESCRIPTION, renderTable, selectRows, summarize, withTable } from '../hooks/routes'

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

  test('selectRows sorts, drops the orchestrator, helpers and unsafe names', () => {
    const { rows } = selectRows([
      offer('reviewer:reviewer'),
      offer('orchestration:orchestration'),
      offer('statusline-setup'),
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
