import type { SessionUsage } from 'claude-code'

type Cell = { ch: string; color?: string }
type Breakdown = NonNullable<SessionUsage['context']['breakdown']>
type Category = Breakdown['categories'][number]
type RateLimit = SessionUsage['rateLimits'][number]

export type BandInput = {
  ui: { Box: any; Text: any; Button: any }
  usage: SessionUsage
  breakdown: Breakdown
  columns: number
  maxRows: number
  expanded: boolean
  now: number
  onToggle: () => void
}

const LABEL = 9
const SHORT: Record<string, string> = {
  'System prompt': 'sys',
  'System tools': 'tools',
  'MCP tools': 'mcp',
  'MCP server instructions': 'mcp-ins',
  'Custom agents': 'agents',
  'Memory files': 'memory',
  Skills: 'skills',
  Messages: 'msgs',
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 999_500) return `${Math.round(n / 1000)}k`
  return `${Number((n / 1e6).toFixed(1))}M`
}

export function fmtReset(iso: string, now: number, spaced: boolean): string {
  const mins = Math.max(0, Math.floor((Date.parse(iso) - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const parts = d > 0 ? [`${d}d`, h && `${h}h`] : h > 0 ? [`${h}h`, m && `${m}m`] : [`${m}m`]
  return parts.filter(Boolean).join(spaced ? ' ' : '')
}

// Splits `width` cells across `tokens` by cumulative rounding, so the widths
// sum to `width` exactly. Every non-zero entry keeps at least one cell.
export function allocate(tokens: number[], width: number): number[] {
  const total = tokens.reduce((a, b) => a + b, 0)
  if (total <= 0) return tokens.map(() => 0)
  let cum = 0
  let prev = 0
  const cells = tokens.map(t => {
    cum += t
    const edge = Math.round((cum / total) * width)
    const n = edge - prev
    prev = edge
    return n
  })
  tokens.forEach((t, i) => {
    if (t > 0 && cells[i] === 0) {
      cells[i] = 1
      cells[cells.indexOf(Math.max(...cells))]!--
    }
  })
  return cells
}

export function limitColor(pct: number): string {
  return pct < 60 ? 'success' : pct < 85 ? 'warning' : 'error'
}

function contextCells(b: Breakdown, width: number, markAt?: number): Cell[] {
  const used = b.categories.filter((c: Category) => c.kind === 'used' && c.tokens > 0)
  const rest = b.categories
    .filter((c: Category) => c.kind === 'free' || c.kind === 'buffer')
    .reduce((sum: number, c: Category) => sum + c.tokens, 0)
  const widths = allocate([...used.map((c: Category) => c.tokens), rest], width)
  const cells: Cell[] = widths.flatMap((n, i) =>
    Array.from({ length: n }, () =>
      i < used.length ? { ch: '█', color: used[i]!.color } : { ch: '░', color: 'inactive' },
    ),
  )
  if (markAt !== undefined) {
    const total = used.reduce((s: number, c: Category) => s + c.tokens, rest)
    const idx = Math.min(width - 1, Math.round((markAt / total) * width))
    if (cells[idx]) cells[idx] = { ch: '┊' }
  }
  return cells
}

// Legend items that fit in `budget` cells; later ones are dropped whole.
function legend(Text: any, items: Category[], budget: number, withTokens: boolean) {
  const out: any[] = []
  let used = 0
  for (const c of items) {
    const name = SHORT[c.name] ?? c.name.toLowerCase()
    const tokens = withTokens ? ` ${fmtTokens(c.tokens)}` : ''
    const gap = out.length ? 2 : 0
    const len = gap + 2 + name.length + tokens.length
    if (used + len > budget) break
    if (gap) out.push(<Text>{'  '}</Text>)
    out.push(<Text color={c.color}>●</Text>, <Text dimColor>{` ${name}`}</Text>, <Text>{tokens}</Text>)
    used += len
  }
  return out
}

function limitCells(pct: number, width: number): Cell[] {
  const filled = Math.min(width, Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * width)))
  return Array.from({ length: width }, (_, i) =>
    i < filled ? { ch: '━', color: limitColor(pct) } : { ch: '─', color: 'inactive' },
  )
}

// Merges neighbouring cells of one color into a single Text.
function runs(Text: any, cells: Cell[]) {
  const out: any[] = []
  let i = 0
  while (i < cells.length) {
    let j = i
    while (j < cells.length && cells[j]!.color === cells[i]!.color) j++
    out.push(<Text color={cells[i]!.color}>{cells.slice(i, j).map(c => c.ch).join('')}</Text>)
    i = j
  }
  return <Text>{out}</Text>
}

// ` ↻1h29m` (or `  ↻ 1h 29m` spaced); empty when the limit has no reset time.
function resetPart(r: RateLimit, now: number, spaced: boolean): string {
  if (!r.resetsAt) return ''
  return spaced ? `  ↻ ${fmtReset(r.resetsAt, now, true)}` : ` ↻${fmtReset(r.resetsAt, now, false)}`
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function renderBand(input: BandInput) {
  const { ui, usage, breakdown: b, columns, maxRows, expanded, now, onToggle } = input
  const { Box, Text, Button } = ui
  const five = usage.rateLimits.find(r => r.kind === 'five_hour')
  const week = usage.rateLimits.find(r => r.kind === 'seven_day')
  const free = b.categories.find((c: Category) => c.kind === 'free')?.tokens ?? 0
  const toggle = (label: string) => (
    <Button key="toggle" plain dimColor label={label} onPress={onToggle} />
  )

  if (expanded && columns >= 50) {
    const wide = columns >= 80
    const compactAt = b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined
    const ctxTail =
      `  ${fmtTokens(b.totalTokens)} / ${fmtTokens(b.maxTokens)} · ${b.percentage}%` +
      (wide && compactAt ? ` · compacts at ${fmtTokens(compactAt)}` : '')
    const limit = (r: RateLimit | undefined, label: string) =>
      r && {
        label,
        pct: r.percentUsed,
        tail: `  ${r.percentUsed}%${resetPart(r, now, true)}`,
      }
    const limits = [limit(five, '5h'), limit(week, 'weekly')].filter(
      (l): l is NonNullable<typeof l> => !!l,
    )
    const legendItems = b.categories.filter((c: Category) => c.kind === 'used' && c.tokens > 0)
    const rowCount = 1 + limits.length + (legendItems.length ? 1 : 0)
    if (rowCount <= maxRows) {
      const tailMax = Math.max(ctxTail.length + 2, ...limits.map(l => l.tail.length))
      const W = clamp(columns - LABEL - tailMax, 10, 200)
      const label = (s: string) => <Text dimColor>{s.padEnd(LABEL)}</Text>
      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            {label('context')}
            {runs(Text, contextCells(b, W, compactAt))}
            <Text>{ctxTail}</Text>
            <Text> </Text>
            {toggle('−')}
          </Box>
          {legendItems.length > 0 && (
            <Box flexDirection="row">
              {label('')}
              <Text>{legend(Text, legendItems, columns - LABEL, wide)}</Text>
            </Box>
          )}
          {limits.map(l => (
            <Box flexDirection="row">
              {label(l.label)}
              {runs(Text, limitCells(l.pct, W))}
              <Text>{l.tail}</Text>
            </Box>
          ))}
        </Box>
      )
    }
  }

  const ctxTail = ` ${b.percentage}%`
  const freeTail = ` · ${fmtTokens(free)} free`
  const limTail = five ? ` ${five.percentUsed}%${resetPart(five, now, false)}` : ''
  // Optional parts drop until the row fits: the 5h segment first, then free tokens.
  const used = (withFree: boolean, withLimit: boolean) =>
    2 + 4 + ctxTail.length + (withFree ? freeTail.length : 0) + (withLimit ? 2 + 3 + limTail.length : 0)
  const withLimit = !!five && columns - used(true, true) >= 16
  const withFree = withLimit || columns - used(true, false) >= 6
  const avail = columns - used(withFree, withLimit)
  const ctxW = withLimit ? clamp(Math.floor(avail * 0.65), 6, 40) : clamp(avail, 4, 40)
  const limW = clamp(avail - ctxW, 6, 16)
  return (
    <Box flexDirection="row">
      <Text dimColor>ctx </Text>
      {runs(Text, contextCells(b, ctxW))}
      <Text>{ctxTail}</Text>
      {withFree && <Text dimColor>{freeTail}</Text>}
      {withLimit && five && (
        <Box flexDirection="row">
          <Text dimColor>{'  5h '}</Text>
          {runs(Text, limitCells(five.percentUsed, limW))}
          <Text>{limTail}</Text>
        </Box>
      )}
      <Text> </Text>
      {toggle('+')}
    </Box>
  )
}
