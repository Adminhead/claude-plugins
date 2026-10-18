import { describe, expect, test } from 'claude-code/testing'
import { MAX_FIELD, appendArgv, clip, line, logFile, pruneArgv, redact } from '../hooks/log/usagelog'

describe('usage log', () => {
  test('common secret shapes are masked', () => {
    const cases: [string, string][] = [
      ['GH_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123 gh api', 'GH_TOKEN=<redacted> gh api'],
      ['gh auth login --with-token github_pat_11ABCDEFGHIJKLMNOPQRSTUV', 'gh auth login --with-token <github-token>'],
      ['export ANTHROPIC_API_KEY="sk-ant-abc123def456ghi789jkl012"', 'export ANTHROPIC_API_KEY=<redacted>'],
      ['curl -H "Authorization: Bearer abcdefghijklmnop123"', 'curl -H "Authorization: Bearer <token>"'],
      ['aws s3 ls # AKIAABCDEFGHIJKLMNOP', 'aws s3 ls # <aws-key>'],
      ['git clone https://bob:hunter2pass@example.com/r.git', 'git clone https://bob:<redacted>@example.com/r.git'],
      ['psql "postgres://app:s3cret@db/app"', 'psql "postgres://app:<redacted>@db/app"'],
      ['DB_PASSWORD: swordfish', 'DB_PASSWORD: <redacted>'],
    ]
    for (const [input, want] of cases) expect(redact(input)).toBe(want)
    expect(redact('-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----')).toBe('<private-key>')
    expect(redact('git log --oneline | grep token')).toBe('git log --oneline | grep token')
  })

  test('fields are clipped after redaction, and a line is one JSON object', () => {
    expect(clip('x'.repeat(MAX_FIELD + 10))).toBe(`${'x'.repeat(MAX_FIELD)}…[+10]`)
    const l = line('bash', { command: 'echo SECRET=abc', n: 3, skipped: undefined }, Date.UTC(2026, 9, 18, 12))
    expect(l.endsWith('\n')).toBe(true)
    expect(JSON.parse(l)).toEqual({ v: 1, ts: '2026-10-18T12:00:00.000Z', kind: 'bash', command: 'echo SECRET=<redacted>', n: 3 })
  })

  test('daily file names and the append and prune commands', () => {
    expect(logFile('bash-rules', Date.UTC(2026, 0, 2))).toBe('bash-rules-2026-01-02.jsonl')
    expect(() => logFile('../x', 0)).toThrow()
    const a = appendArgv('usage-log-2026-01-02.jsonl')
    expect(a.slice(0, 2)).toEqual(['sh', '-c'])
    expect(a[2]).toContain('umask 077')
    expect(a[4]).toBe('usage-log-2026-01-02.jsonl')
    expect(pruneArgv(0.5)[4]).toBe('1')
    expect(pruneArgv(30)[2]).toContain('-mtime +"$1" -delete')
  })
})
