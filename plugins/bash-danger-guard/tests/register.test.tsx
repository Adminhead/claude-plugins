import { describe, expect, test } from 'claude-code/testing'

describe('register', () => {
  test('a destructive command is denied before the tool runs', async ($, on) => {
    let ran = false
    on('tool.call', async () => {
      ran = true
      return { result: 'ok' }
    })
    const out: any = await $.tool.call({ tool: 'Bash', command: 'rm -rf ~' } as never)
    expect(out.deny).toMatch(/^bash-danger-guard: .*recursive rm/)
    expect(ran).toBe(false)
  })

  test('an ordinary command reaches the tool', async ($, on) => {
    on('tool.call', async () => ({ result: 'ok' }))
    const out: any = await $.tool.call({ tool: 'Bash', command: 'rm -rf ./build' } as never)
    expect(out.deny).toBeUndefined()
  })

  test('an unparseable command is denied', async ($, on) => {
    on('tool.call', async () => ({ result: 'ok' }))
    const out: any = await $.tool.call({ tool: 'Bash', command: 'echo $(' } as never)
    expect(out.deny).toMatch(/could not parse/)
  })
})
