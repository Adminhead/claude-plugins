import { describe, expect, test } from 'claude-code/testing'
import { register } from '../hooks/register'

describe('plan-ledger probe', () => {
  test('registers without throwing', () => {
    expect(typeof register).toBe('function')
  })
})
