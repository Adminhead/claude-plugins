import { describe, expect, test } from 'claude-code/testing'
import { laterDeny } from '../hooks/rules/outcome'

describe('laterDeny', () => {
  test('a hook-error tool result is a later deny', () => {
    expect(laterDeny({ isError: true, text: 'PreToolUse:Bash hook error: Save a plan' }, undefined)).toBe('PreToolUse:Bash hook error: Save a plan')
    expect(laterDeny({ isError: true, content: [{ type: 'text', text: 'PreToolUse:Bash hook error: x' }] }, undefined)).toBe('PreToolUse:Bash hook error: x')
  })

  test('a plain failure or a success is not', () => {
    expect(laterDeny({ isError: true, text: 'exit 1' }, undefined)).toBeNull()
    expect(laterDeny({ isError: false, text: 'PreToolUse:Bash hook error: x' }, undefined)).toBeNull()
    expect(laterDeny({ result: 'ok' }, undefined)).toBeNull()
    expect(laterDeny(undefined, undefined)).toBeNull()
  })

  test('the stored classic deny wins and the text is bounded', () => {
    expect(laterDeny({ result: 'ok' }, 'blocked')).toBe('blocked')
    expect(laterDeny({ isError: true, text: 'PreToolUse:Bash hook error: ' + 'x'.repeat(500) }, undefined)).toHaveLength(300)
  })
})
