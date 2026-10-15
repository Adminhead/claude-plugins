import { describe, expect, test } from 'claude-code/testing'
import { classify } from '../hooks/tool-mgr/rules'
import type { Verdict } from '../hooks/tool-mgr/rules'
import { CALIBRATED, DEFAULT_MODEL, PROMPT_VERSION, buildRequest, calFor, createJudge, merge, parseConfig, parseReply } from '../hooks/tool-mgr/systemone'
import type { Answer, Config, Deps } from '../hooks/tool-mgr/systemone'

const KEV = DEFAULT_MODEL
const cal = calFor(KEV)
const uncal = calFor('clef-flash')
const cfg: Config = { url: 'http://127.0.0.1:9931/v1/systemone', model: KEV }
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

// Replies as the real Kev server sent them (plugins/coremods/tests/fixtures/systemone-replies.jsonl rows 0, 1, 8 and 19),
// inlined because the test sandbox is not known to read that file.
const row = (answers: unknown) => JSON.stringify({ model: KEV, answers, usage: { input_tokens: 281, output_tokens: 0 } })
const REAL = {
  sedIWithBypass: row({
    decision: { type: 'choice', choice: 'ask', probabilities: { allow: 0.17702691516804933, ask: 0.6399670799357102, deny: 0.18300600489624053 }, confidence: 0.45995061990356534 },
    bypass: { type: 'noul', noul: 0.5408188703759207 },
  }),
  sedINoBypass: row({
    decision: { type: 'choice', choice: 'ask', probabilities: { allow: 0.17619019790305845, ask: 0.6371177937825903, deny: 0.18669200831435118 }, confidence: 0.4556766906738854 },
  }),
  lsWithBypass: row({
    decision: { type: 'choice', choice: 'allow', probabilities: { allow: 0.4722924349119909, ask: 0.31810340133733656, deny: 0.20960416375067253 }, confidence: 0.20843865236798637 },
    bypass: { type: 'noul', noul: 0.18956552574187344 },
  }),
  pythonNoBypass: row({
    decision: { type: 'choice', choice: 'deny', probabilities: { allow: 0.24871474572086755, ask: 0.3722523355786688, deny: 0.3790329187004636 }, confidence: 0.06854937805069537 },
  }),
}

const reply = (allow: number, ask: number, deny: number, bypass?: number, model = KEV) =>
  JSON.stringify({
    model,
    answers: {
      decision: { type: 'choice', choice: allow >= ask && allow >= deny ? 'allow' : ask >= deny ? 'ask' : 'deny', probabilities: { allow, ask, deny }, confidence: 0.5 },
      ...(bypass === undefined ? {} : { bypass: { type: 'noul', noul: bypass } }),
    },
  })
const ok = (text: string) => ({ status: 200, text })
const answer = (allow: number, bypass: number | null = null, choice: Answer['choice'] = 'allow'): Answer => ({ model: KEV, choice, allow, ask: 0.3, deny: 0.2, bypass })

// A judge with scripted fetch, a manual clock and manual timers. `fire` makes every pending timer elapse.
function rig(handler: (n: number) => Promise<{ status: number; text: string }> = async () => ok(reply(0.9, 0.05, 0.05, 0.1))) {
  let t = 0
  const bodies: string[] = []
  const reports: string[] = []
  const timers = new Set<() => void>()
  const sleeps = new Map<() => void, number>() // each pending timer's requested ms
  const deps: Deps = {
    fetch: async (_url, init) => {
      bodies.push(init.body)
      return handler(bodies.length)
    },
    sleep: (ms, { signal }) =>
      new Promise((resolve, reject) => {
        const fire = () => resolve(undefined)
        timers.add(fire)
        sleeps.set(fire, ms)
        signal.addEventListener('abort', () => {
          timers.delete(fire)
          sleeps.delete(fire)
          reject(new Error('aborted'))
        })
      }),
    now: async () => t,
    report: m => reports.push(m),
  }
  const j = createJudge()
  return {
    judge: (c: Config, command: string) => j.judge(c, command, deps),
    reset: j.reset,
    bodies,
    reports,
    timers,
    advance: (ms: number) => (t += ms),
    // Elapses the pending timers that asked for at most `maxMs`.
    fire: async (maxMs = Infinity) => {
      for (const f of [...timers]) if ((sleeps.get(f) ?? 0) <= maxMs) f()
      await flush()
    },
  }
}
const hang = () => new Promise<{ status: number; text: string }>(() => {})
const deferred = () => {
  let resolve!: (r: { status: number; text: string }) => void
  const promise = new Promise<{ status: number; text: string }>(r => (resolve = r))
  return { promise, resolve }
}

describe('parseConfig', () => {
  test('unset and blank are off, with no error', () => {
    expect(parseConfig(undefined)).toEqual({ config: null })
    expect(parseConfig('  ')).toEqual({ config: null })
  })

  test('the model is optional and defaults to Kev', () => {
    expect(parseConfig('http://127.0.0.1:9931/v1/systemone').config).toEqual({ url: 'http://127.0.0.1:9931/v1/systemone', model: DEFAULT_MODEL })
    expect(parseConfig('https://llm.example.com/v1/systemone|clef-flash').config).toEqual({ url: 'https://llm.example.com/v1/systemone', model: 'clef-flash' })
  })

  test('http is allowed only on loopback', () => {
    for (const u of ['http://127.0.0.1:1/x', 'http://localhost/x', 'http://[::1]:9/x', 'https://example.com/x']) expect(parseConfig(u).config).not.toBeNull()
    for (const u of ['http://example.com/x', 'http://127.0.0.2/x', 'ftp://127.0.0.1/x', 'not a url', '|clef']) {
      const r = parseConfig(u)
      expect(r.config).toBeNull()
      expect(r.error).toContain('TOOL_MGR_SYSTEMONE')
    }
  })

  test('userinfo, a fragment, or an empty model is an error', () => {
    for (const v of ['https://u:p@example.com/x', 'https://u@example.com/x', 'https://example.com/x#f', 'https://example.com/x|', 'https://example.com/x|  ']) {
      expect(parseConfig(v).config).toBeNull()
      expect(parseConfig(v).error).toBeDefined()
    }
  })
})

describe('calibration and questions', () => {
  test('only Kev is calibrated', () => {
    expect(Object.keys(CALIBRATED)).toEqual([KEV])
    expect(cal).toEqual({ allowBelow: 0.5, bypassAtLeast: 0.6 })
    expect(uncal).toEqual({ allowBelow: 0.5 })
    expect(PROMPT_VERSION).toBe(1)
  })

  test('the request carries the pinned questions, and the bypass question only when asked for', () => {
    const withBypass = buildRequest('git status', KEV, true)
    expect(Object.keys(withBypass.questions)).toEqual(['decision', 'bypass'])
    expect(Object.keys(withBypass.questions.decision.criteria)).toEqual(['allow', 'ask', 'deny'])
    expect(withBypass.questions.bypass).not.toHaveProperty('criteria')
    expect(withBypass.questions.bypass.instructions.endsWith('instead of the Edit/Read tools?')).toBe(true)
    expect(withBypass.questions.decision.instructions.endsWith(' Decide what the guard should do.')).toBe(true)
    expect(withBypass.state).toBe('git status')
    expect(Object.keys(buildRequest('git status', 'clef-flash', false).questions)).toEqual(['decision'])
  })

  test('the judge sends the bypass question to Kev only', async () => {
    const kev = rig()
    await kev.judge(cfg, 'git status')
    expect(Object.keys(JSON.parse(kev.bodies[0]).questions)).toEqual(['decision', 'bypass'])
    const clef = rig(async () => ok(reply(0.9, 0.05, 0.05, undefined, 'clef-flash')))
    expect(await clef.judge({ url: cfg.url, model: 'clef-flash' }, 'git status')).not.toBeNull()
    expect(Object.keys(JSON.parse(clef.bodies[0]).questions)).toEqual(['decision'])
  })
})

describe('parseReply', () => {
  test('accepts the real Kev replies', () => {
    expect(parseReply(REAL.sedIWithBypass, true)).toEqual({ model: KEV, choice: 'ask', allow: 0.17702691516804933, ask: 0.6399670799357102, deny: 0.18300600489624053, bypass: 0.5408188703759207 })
    expect(parseReply(REAL.lsWithBypass, true)?.choice).toBe('allow')
    expect(parseReply(REAL.sedINoBypass, false)?.bypass).toBeNull()
    expect(parseReply(REAL.pythonNoBypass, false)?.choice).toBe('deny')
  })

  test('a bypass answer the reply carries is ignored when it was not asked for', () => {
    expect(parseReply(REAL.sedIWithBypass, false)?.bypass).toBeNull()
  })

  test('a bypass answer that is missing when it was sent is malformed', () => {
    expect(parseReply(REAL.sedINoBypass, true)).toBeNull()
  })

  test('malformed replies are null', () => {
    const d = (over: object = {}) => ({ type: 'choice', choice: 'allow', probabilities: { allow: 0.8, ask: 0.1, deny: 0.1 }, ...over })
    const body = (answers: unknown, extra: object = {}) => JSON.stringify({ model: KEV, answers, ...extra })
    const bad = [
      'not json',
      '[]',
      'null',
      JSON.stringify({ answers: { decision: d() } }),
      JSON.stringify({ model: 1, answers: { decision: d() } }),
      JSON.stringify({ model: KEV }),
      body([]),
      body({}),
      body({ decision: d({ type: 'noul' }) }),
      body({ decision: d({ choice: 'maybe' }) }),
      body({ decision: d({ probabilities: { allow: 0.8, ask: 0.1 } }) }),
      body({ decision: d({ probabilities: { allow: 0.8, ask: 0.1, deny: 0.05, bypass: 0.05 } }) }),
      body({ decision: d({ probabilities: { allow: 0.8, ask: 0.1, other: 0.1 } }) }),
      body({ decision: d({ probabilities: { allow: 1.2, ask: -0.1, deny: -0.1 } }) }),
      body({ decision: d({ probabilities: { allow: '0.8', ask: 0.1, deny: 0.1 } }) }),
      body({ decision: d({ probabilities: { allow: 0.5, ask: 0.1, deny: 0.1 } }) }),
      body({ decision: d({ probabilities: { allow: 0.5, ask: 0.5, deny: 0.06 } }) }),
      body({ decision: d({ probabilities: { allow: null, ask: 0.5, deny: 0.5 } }) }),
    ]
    for (const t of bad) expect(parseReply(t, false)).toBeNull()
    expect(parseReply(body({ decision: d({ probabilities: { allow: 0.8, ask: 0.1, deny: 0.14 } }) }), false)).not.toBeNull()
    for (const b of [{ type: 'choice', noul: 0.5 }, { type: 'noul', noul: 1.5 }, { type: 'noul', noul: -0.1 }, { type: 'noul', noul: '0.5' }, { type: 'noul' }, 0.5]) {
      expect(parseReply(body({ decision: d(), bypass: b }), true)).toBeNull()
    }
  })

  test('a reply over 64 KB is malformed', () => {
    expect(parseReply(REAL.sedINoBypass + ' '.repeat(64 * 1024), false)).toBeNull()
  })
})

describe('merge', () => {
  const E = {} as Verdict
  const tiers = ['ask', 'deny'] as const

  test('no answer, or a lower deny, leaves the verdict alone', () => {
    const deny: Verdict = { deny: 'no' }
    for (const t of tiers) {
      expect(merge(E, null, t, cal).verdict).toBe(E)
      expect(merge(deny, answer(0.1, 0.99), t, cal)).toEqual({ verdict: deny, rule: null })
    }
  })

  test('bypass at 0.6 denies under every tier; 0.59 does not', () => {
    for (const t of tiers) {
      const r = merge(E, answer(0.9, 0.6), t, cal)
      expect(r.rule).toBe('systemone-bypass')
      expect(r.verdict.deny).toContain('(bypass 0.60). Use Read to read a file, Edit or Write to change one, and Grep or Glob to search.')
      expect(r.verdict.deny).toContain('Do not reword it')
      expect(merge(E, answer(0.9, 0.59), t, cal)).toEqual({ verdict: E, rule: null })
    }
  })

  test('bypass beats an inner ask, and a danger ask is otherwise kept', () => {
    const danger: Verdict = { ask: 'remote exec' }
    expect(merge(danger, answer(0.9, 0.72), 'ask', cal).rule).toBe('systemone-bypass')
    expect(merge(danger, answer(0.1, 0.2), 'ask', cal)).toEqual({ verdict: danger, rule: null })
  })

  test('P(allow) under 0.5 asks; exactly 0.5 does not', () => {
    const r = merge(E, answer(0.31, 0.2), 'ask', cal)
    expect(r.rule).toBeNull()
    expect(r.verdict.ask).toBe('tool-mgr: the systemone model is unsure this command is safe (allow 0.31, ask 0.30, deny 0.20).')
    expect(merge(E, answer(0.5, 0.2), 'ask', cal)).toEqual({ verdict: E, rule: null })
    expect(merge(E, answer(0.4999, 0.2), 'ask', cal).verdict.ask).toBeDefined()
  })

  test('an ask drops allow and keeps the other fields, including updatedInput', () => {
    const inner: Verdict = { allow: true, updatedInput: { command: 'ls' } }
    expect(merge(inner, answer(0.1), 'ask', cal).verdict).toEqual({ updatedInput: { command: 'ls' }, ask: expect.stringContaining('unsure') })
    expect(merge(inner, answer(0.9, 0.8), 'ask', cal).verdict).toEqual({ updatedInput: { command: 'ls' }, deny: expect.stringContaining('bypass 0.80') })
  })

  test('under ASK_TIER deny the model ask becomes a hand-over deny', () => {
    const r = merge(E, answer(0.1), 'deny', cal)
    expect(r.rule).toBe('systemone')
    expect(r.verdict.deny).toBe('tool-mgr: the systemone model is unsure this command is safe (allow 0.10, ask 0.30, deny 0.20). Hand this command to the user to run.')
    expect(r.verdict.ask).toBeUndefined()
  })

  test('an uncalibrated model gets the ask path only', () => {
    expect(merge(E, answer(0.9, 0.99), 'ask', uncal)).toEqual({ verdict: E, rule: null })
    expect(merge(E, answer(0.3, 0.99), 'ask', uncal).verdict.ask).toBeDefined()
    expect(merge(E, answer(0.3, 0.99), 'ask', uncal).rule).toBeNull()
  })

  test('a bypass deny whose top label is deny names both scores and hands over', () => {
    const r = merge(E, { model: KEV, choice: 'deny', allow: 0.1, ask: 0.2, deny: 0.7, bypass: 0.72 }, 'ask', cal)
    expect(r.rule).toBe('systemone-bypass')
    expect(r.verdict.deny).toContain('bypass 0.72')
    expect(r.verdict.deny).toContain('deny 0.70')
    expect(r.verdict.deny).toContain('Hand this command to the user to run.')
  })

  test('static passes, model denies: commands classify() lets through', async () => {
    const passes = [
      "sed -i 's/a/b/' f",
      "sed -i.bak 's/a/b/' f",
      "sed --in-place 's/a/b/' f",
      "sed -ni 's/a/b/p' f",
      'cat <<EOF\nhi\nEOF',
      "python3 - <<'EOF'\nprint(open('a').read())\nEOF",
      'ls > f',
    ]
    let bypass = 0.72
    const r = rig(async () => ok(reply(0.9, 0.05, 0.05, bypass)))
    for (const c of passes) {
      expect(classify(c)).toBeNull()
      bypass = 0.72
      const high = merge(E, await r.judge(cfg, c + ' '), 'ask', cal)
      expect(high.rule).toBe('systemone-bypass')
      expect(high.verdict.deny).toContain('bypass 0.72')
      bypass = 0.54
      expect(merge(E, await r.judge(cfg, c + '  '), 'ask', cal)).toEqual({ verdict: E, rule: null })
    }
  })

  test('a bypass deny is a deny alone: the inner ask and allow are dropped', () => {
    for (const inner of [{ ask: 'x' }, { allow: true, ask: 'x' }, { allow: true }] as Verdict[]) {
      const v = merge(inner, answer(0.9, 0.72), 'ask', cal).verdict
      expect(v.ask).toBeUndefined()
      expect(v.allow).toBeUndefined()
      expect(v.deny).toContain('bypass 0.72')
    }
  })

  test('under tier deny: an inner ask stays, and an uncalibrated model gets a hand-over deny', () => {
    const danger: Verdict = { ask: 'remote exec' }
    expect(merge(danger, answer(0.1, 0.2), 'deny', cal)).toEqual({ verdict: danger, rule: null })
    const r = merge(E, answer(0.3, 0.99), 'deny', uncal)
    expect(r.rule).toBe('systemone')
    expect(r.verdict.deny).toContain('Hand this command to the user to run.')
    expect(merge(E, answer(0.9, 0.99), 'deny', uncal)).toEqual({ verdict: E, rule: null })
  })
})

describe('judge', () => {
  const noCommand = (r: { reports: string[] }, command: string) => expect(r.reports.every(m => !m.includes(command))).toBe(true)

  test('a good reply is returned and the request is a POST of the raw command', async () => {
    const r = rig(async () => ok(REAL.lsWithBypass))
    const a = await r.judge(cfg, 'ls')
    expect(a?.allow).toBe(0.4722924349119909)
    expect(JSON.parse(r.bodies[0])).toEqual(buildRequest('ls', KEV, true))
    expect(r.timers.size).toBe(0)
    expect(r.reports).toEqual([])
  })

  test('over 4000 chars: no request, one report, no command text', async () => {
    const r = rig()
    const long = 'echo ' + 'a'.repeat(4000)
    expect(await r.judge(cfg, long)).toBeNull()
    expect(r.bodies.length).toBe(0)
    expect(r.reports.length).toBe(1)
    noCommand(r, long)
    expect(await r.judge(cfg, 'a'.repeat(4000))).not.toBeNull()
  })

  test('a timeout returns null after the 1000 ms race and reports once', async () => {
    const r = rig(hang)
    const p = r.judge(cfg, 'sleep 9')
    await flush()
    expect(r.timers.size).toBe(1)
    await r.fire()
    expect(await p).toBeNull()
    expect(r.reports).toEqual(['systemone: no reply within 1000 ms'])
  })

  test('connection refused, 400, 404, a 500 and garbage each return null with their own cause', async () => {
    const cases: [() => Promise<{ status: number; text: string }>, string][] = [
      [async () => { throw new Error('ECONNREFUSED 127.0.0.1:9931') }, 'systemone: connection error'],
      [async () => ({ status: 400, text: '{"error":"x"}' }), 'systemone: http 400'],
      [async () => ({ status: 404, text: '' }), 'systemone: http 404'],
      [async () => ({ status: 500, text: '' }), 'systemone: http 500'],
      [async () => ok('nope'), 'systemone: malformed reply'],
      [async () => ok(REAL.sedINoBypass), 'systemone: malformed reply'],
    ]
    for (const [handler, cause] of cases) {
      const r = rig(handler)
      expect(await r.judge(cfg, 'secret-cmd')).toBeNull()
      expect(r.reports).toEqual([cause])
      noCommand(r, 'secret-cmd')
    }
  })

  test('a reply from another model than configured is a failure', async () => {
    const r = rig(async () => ok(reply(0.9, 0.05, 0.05, 0.1, 'other-model')))
    expect(await r.judge(cfg, 'ls')).toBeNull()
    expect(r.reports[0]).toContain('different model')
  })

  test('a late success is ignored: no memo, and the next call asks again', async () => {
    const late = deferred()
    const r = rig(n => (n === 1 ? late.promise : Promise.resolve(ok(reply(0.9, 0.05, 0.05, 0.1)))))
    const p = r.judge(cfg, 'ls')
    await flush()
    await r.fire()
    expect(await p).toBeNull()
    late.resolve(ok(reply(0.9, 0.05, 0.05, 0.1)))
    await flush()
    expect(await r.judge(cfg, 'ls')).not.toBeNull()
    expect(r.bodies.length).toBe(2)
  })

  test('the memo answers a repeat with one fetch and does not keep failures', async () => {
    const r = rig(async n => (n === 1 ? { status: 500, text: '' } : ok(reply(0.9, 0.05, 0.05, 0.1))))
    expect(await r.judge(cfg, 'ls')).toBeNull()
    const a = await r.judge(cfg, 'ls')
    expect(await r.judge(cfg, 'ls')).toBe(a)
    expect(r.bodies.length).toBe(2)
  })

  test('the memo holds 256 entries, oldest out first', async () => {
    const r = rig()
    for (let i = 0; i < 257; i++) await r.judge(cfg, `echo ${i}`)
    expect(r.bodies.length).toBe(257)
    await r.judge(cfg, 'echo 1')
    expect(r.bodies.length).toBe(257)
    await r.judge(cfg, 'echo 0')
    expect(r.bodies.length).toBe(258)
  })

  test('identical calls in flight share one request', async () => {
    const d = deferred()
    const r = rig(() => d.promise)
    const [p1, p2] = [r.judge(cfg, 'ls'), r.judge(cfg, 'ls')]
    await flush()
    d.resolve(ok(reply(0.9, 0.05, 0.05, 0.1)))
    const [a1, a2] = await Promise.all([p1, p2])
    expect(a1).not.toBeNull()
    expect(a2).toBe(a1)
    expect(r.bodies.length).toBe(1)
  })

  test('at most 4 requests pend, timed-out ones included; the fifth waits, then is skipped with one busy report', async () => {
    const r = rig(hang)
    const timedOut = [1, 2].map(i => r.judge(cfg, `echo ${i}`))
    await flush()
    await r.fire()
    await Promise.all(timedOut)
    const waiting = [3, 4].map(i => r.judge(cfg, `echo ${i}`))
    await flush()
    expect(r.bodies.length).toBe(4)
    const fifth = r.judge(cfg, 'echo 5')
    await flush()
    expect(r.bodies.length).toBe(4)
    expect(r.reports.filter(m => m.includes('busy')).length).toBe(0)
    await r.fire() // the deadline passes with no slot free
    expect(await fifth).toBeNull()
    expect(r.bodies.length).toBe(4)
    expect(r.reports.filter(m => m.includes('busy')).length).toBe(1)
    await Promise.all(waiting)
  })

  test('a fifth call gets a slot when one frees up within its deadline', async () => {
    const held = [1, 2, 3, 4].map(() => deferred())
    const r = rig(n => (n <= 4 ? held[n - 1].promise : Promise.resolve(ok(reply(0.9, 0.05, 0.05, 0.1)))))
    const first = [1, 2, 3, 4].map(i => r.judge(cfg, `echo ${i}`))
    await flush()
    const fifth = r.judge(cfg, 'echo 5')
    await flush()
    expect(r.bodies.length).toBe(4)
    held[0].resolve(ok(reply(0.9, 0.05, 0.05, 0.1)))
    await flush()
    expect(r.bodies.length).toBe(5)
    expect(await fifth).not.toBeNull()
    expect(r.reports.filter(m => m.includes('busy')).length).toBe(0)
    for (const h of held.slice(1)) h.resolve(ok('x'))
    await Promise.all(first)
  })

  test('a slot that frees with under 100 ms left sends nothing and reports busy', async () => {
    const held = [1, 2, 3, 4].map(() => deferred())
    const r = rig(n => held[n - 1].promise)
    const first = [1, 2, 3, 4].map(i => r.judge(cfg, `echo ${i}`))
    await flush()
    const fifth = r.judge(cfg, 'echo 5')
    await flush()
    r.advance(950)
    held[0].resolve(ok(reply(0.9, 0.05, 0.05, 0.1)))
    await flush()
    expect(await fifth).toBeNull()
    expect(r.bodies.length).toBe(4)
    expect(r.reports.filter(m => m.includes('busy')).length).toBe(1)
    for (const h of held.slice(1)) h.resolve(ok('x'))
    await Promise.all(first)
  })

  test('a timeout on a shortened budget is logged with it and does not count toward the breaker', async () => {
    const held = [1, 2, 3, 4].map(() => deferred())
    const r = rig(n => (n <= 4 ? held[n - 1].promise : hang()))
    const first = [1, 2, 3, 4].map(i => r.judge(cfg, `echo ${i}`))
    await flush()
    for (let i = 0; i < 3; i++) {
      const next = r.judge(cfg, `echo late ${i}`)
      await flush()
      r.advance(600)
      held[i].resolve(ok(reply(0.9, 0.05, 0.05, 0.1))) // frees a slot with 400 ms left
      await flush()
      expect(r.bodies.length).toBe(5 + i)
      await r.fire(500) // only the 400 ms timer
      expect(await next).toBeNull()
    }
    expect(r.reports.filter(m => m.includes('no reply within 400 ms')).length).toBe(3)
    expect(r.reports.some(m => m.includes('failures in a row'))).toBe(false)
    held[3].resolve(ok('x'))
    await Promise.all(first)
    const again = r.judge(cfg, 'echo again') // the breaker is still closed, so this sends
    await flush()
    expect(r.bodies.length).toBe(8)
    await r.fire()
    expect(await again).toBeNull()
  })

  test('a late settle from before a reset does not free a slot in the new generation', async () => {
    const held = [1, 2, 3, 4].map(() => deferred())
    const r = rig(n => (n <= 4 ? held[n - 1].promise : hang()))
    const old = [1, 2, 3, 4].map(i => r.judge(cfg, `echo ${i}`))
    await flush()
    r.reset()
    const fresh = [5, 6, 7, 8].map(i => r.judge(cfg, `echo ${i}`))
    await flush()
    expect(r.bodies.length).toBe(8) // reset zeroed the count, so all four new requests went out
    for (const h of held) h.resolve(ok('x'))
    await flush()
    const ninth = r.judge(cfg, 'echo 9')
    await flush()
    expect(r.bodies.length).toBe(8) // the old settles did not decrement the new count
    await r.fire()
    expect(await ninth).toBeNull()
    await Promise.all([...old, ...fresh])
  })

  test('a rejected clock leaves nothing stuck: the next call judges normally', async () => {
    let broken = true
    const j = createJudge()
    const deps: Deps = {
      fetch: async () => ok(reply(0.9, 0.05, 0.05, 0.1)),
      sleep: () => new Promise(() => {}),
      now: async () => {
        if (broken) throw new Error('clock gone')
        return 0
      },
      report: () => {},
    }
    await expect(j.judge(cfg, 'ls', deps)).rejects.toThrow('clock gone')
    broken = false
    expect(await j.judge(cfg, 'ls', deps)).not.toBeNull()
  })

  test('a call the cap refuses does not take the probe slot', async () => {
    const held = [1, 2, 3, 4].map(() => deferred())
    const r = rig(n => (n <= 4 ? held[n - 1].promise : Promise.resolve(ok(reply(0.9, 0.05, 0.05, 0.1)))))
    const first = [1, 2, 3, 4].map(i => r.judge(cfg, `echo ${i}`))
    await flush()
    await r.fire() // four timeouts open the breaker; all four requests still pend
    await Promise.all(first)
    r.advance(60_000)
    const five = r.judge(cfg, 'echo 5')
    await flush()
    await r.fire() // no slot frees before its deadline
    expect(await five).toBeNull()
    expect(r.bodies.length).toBe(4)
    for (const h of held) h.resolve(ok('x'))
    await flush()
    expect(await r.judge(cfg, 'echo 6')).not.toBeNull()
    expect(r.bodies.length).toBe(5)
  })

  test('concurrent calls past the window send one probe, and the opening is reported once', async () => {
    const probe = deferred()
    const r = rig(n => (n <= 3 ? Promise.resolve({ status: 500, text: '' }) : probe.promise))
    for (const c of ['a', 'b', 'c']) await r.judge(cfg, c)
    r.advance(60_000)
    const calls = ['d', 'e', 'f'].map(c => r.judge(cfg, c))
    await flush()
    expect(r.bodies.length).toBe(4)
    probe.resolve({ status: 500, text: '' })
    await Promise.all(calls)
    expect(await r.judge(cfg, 'g')).toBeNull() // the failed probe reopened the window
    expect(r.bodies.length).toBe(4)
    expect(r.reports.filter(m => m.includes('3 failures')).length).toBe(1)
  })

  test('a late failure does not count twice, and a late success does not close the breaker', async () => {
    const held = [deferred(), deferred()]
    const r = rig(n => (n <= 2 ? held[n - 1].promise : hang()))
    const two = ['a', 'b'].map(c => r.judge(cfg, c))
    await flush()
    await r.fire()
    await Promise.all(two)
    held[0].resolve({ status: 500, text: '' })
    held[1].resolve({ status: 500, text: '' })
    await flush()
    const third = r.judge(cfg, 'c') // two failures so far: still closed
    await flush()
    expect(r.bodies.length).toBe(3)
    await r.fire()
    await third
    expect(await r.judge(cfg, 'd')).toBeNull() // the third timeout opened it
    expect(r.bodies.length).toBe(3)

    const s = rig(n => (n <= 2 ? held2[n - 1].promise : hang()))
    const held2 = [deferred(), deferred()]
    const pair = ['a', 'b'].map(c => s.judge(cfg, c))
    await flush()
    await s.fire()
    await Promise.all(pair)
    for (const h of held2) h.resolve(ok(reply(0.9, 0.05, 0.05, 0.1)))
    await flush()
    const last = s.judge(cfg, 'c')
    await flush()
    await s.fire()
    await last
    expect(await s.judge(cfg, 'd')).toBeNull() // late successes had not reset the count
    expect(s.bodies.length).toBe(3)
  })

  test('three failures open the breaker for 60 s, then one probe closes it', async () => {
    let ok_ = false
    const r = rig(async () => (ok_ ? ok(reply(0.9, 0.05, 0.05, 0.1)) : { status: 500, text: '' }))
    for (const c of ['a', 'b', 'c']) await r.judge(cfg, c)
    expect(r.reports.filter(m => m.includes('3 failures')).length).toBe(1)
    expect(await r.judge(cfg, 'd')).toBeNull()
    r.advance(59_999)
    expect(await r.judge(cfg, 'd')).toBeNull()
    expect(r.bodies.length).toBe(3)
    r.advance(1)
    ok_ = true
    expect(await r.judge(cfg, 'd')).not.toBeNull()
    expect(r.bodies.length).toBe(4)
    expect(r.reports[r.reports.length - 1]).toContain('back after a good reply')
    expect(await r.judge(cfg, 'e')).not.toBeNull()
  })

  test('a failed probe reopens the breaker, and only one probe runs at a time', async () => {
    const r = rig(async n => (n <= 3 ? { status: 500, text: '' } : hang()))
    for (const c of ['a', 'b', 'c']) await r.judge(cfg, c)
    r.advance(60_000)
    const probe = r.judge(cfg, 'd')
    await flush()
    expect(await r.judge(cfg, 'e')).toBeNull()
    expect(r.bodies.length).toBe(4)
    await r.fire()
    expect(await probe).toBeNull()
    expect(await r.judge(cfg, 'f')).toBeNull()
    expect(r.bodies.length).toBe(4)
  })

  test('reset voids a reply in flight and clears the memo', async () => {
    const d = deferred()
    const r = rig(n => (n === 1 ? d.promise : Promise.resolve(ok(reply(0.9, 0.05, 0.05, 0.1)))))
    const p = r.judge(cfg, 'ls')
    await flush()
    r.reset()
    d.resolve(ok(reply(0.9, 0.05, 0.05, 0.1)))
    await p
    await r.judge(cfg, 'ls')
    expect(r.bodies.length).toBe(2)
    r.reset()
    await r.judge(cfg, 'ls')
    expect(r.bodies.length).toBe(3)
  })
})
