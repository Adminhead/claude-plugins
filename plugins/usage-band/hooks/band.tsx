// Draws the band from a usage snapshot. Pure: it takes the element table and never touches `$`.

import type { SessionUsage } from 'claude-code'
import { fmtClock, fmtReset, fmtTokens, fmtUsd, labelOf } from './format'
import type { BandOptions } from './options'
import { grade, levelColor, type Grade } from './pace'

type Cell = { ch: string; color?: string }
type Breakdown = NonNullable<SessionUsage['context']['breakdown']>
type Category = Breakdown['categories'][number]
type RateLimit = SessionUsage['rateLimits'][number]

// What the band shows beside the usage snapshot, collected by register.tsx.
export type SessionExtras = {
  costUsd?: number
  cacheHit?: number | null
  compactions: number
  effort?: string
}

export type BandInput = {
  ui: { Box: any; Text: any; Button: any }
  usage: SessionUsage
  breakdown: Breakdown
  columns: number
  maxRows: number
  expanded: boolean
  now: number
  options: BandOptions
  extras: SessionExtras
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
const ORDER = ['five_hour', 'seven_day', 'spend_limit']

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

// A limit bar; past 100% (an exceeded spend limit) it stays full.
function limitCells(pct: number, width: number, color: string): Cell[] {
  const filled = Math.min(width, Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * width)))
  return Array.from({ length: width }, (_, i) => (i < filled ? { ch: '━', color } : { ch: '─', color: 'inactive' }))
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

// ` ↻1h29m` / ` ↻14:30` (or `  ↻ 1h 29m` spaced); empty when the limit has no reset time.
export function resetPart(r: RateLimit, now: number, spaced: boolean, style: BandOptions['resetStyle']): string {
  if (!r.resetsAt) return ''
  const at = Date.parse(r.resetsAt)
  if (!Number.isFinite(at)) return ''
  const when = style === 'clock' ? fmtClock(at, now) : fmtReset(r.resetsAt, now, spaced)
  return spaced ? `  ↻ ${when}` : ` ↻${when}`
}

type Lim = { r: RateLimit; g: Grade; color: string }

// The windows in band order (5h, weekly, spend, then any other), each graded.
export function gradeLimits(limits: readonly RateLimit[], now: number): Lim[] {
  const rank = (k: string) => (ORDER.indexOf(k) + ORDER.length + 1) % (ORDER.length + 1)
  return [...limits]
    .filter(r => typeof r?.kind === 'string' && Number.isFinite(Number(r.percentUsed)))
    .sort((a, b) => rank(a.kind) - rank(b.kind))
    .map(r => {
      const g = grade(r, now)
      return { r, g, color: levelColor(g.level) }
    })
}

const alerting = (l: Lim) => l.g.level !== 'ok'

// The hide-until-threshold rule: a window shows at or past the threshold, or on a pace alert.
export const isShown = (l: Lim, o: BandOptions) => l.r.percentUsed >= o.limitsThreshold || alerting(l)

// Which shown windows the collapsed row carries: 5h always, the others once high or pacing badly.
export const inCollapsed = (l: Lim, o: BandOptions) =>
  l.r.kind === 'five_hour' || l.r.percentUsed >= o.weeklyThreshold || alerting(l)

// `38%` or `72%▲`, coloured by grade unless it is fine.
function pctText(Text: any, l: Lim) {
  const s = `${l.r.percentUsed}%${l.g.ahead ? '▲' : ''}`
  return alerting(l) ? <Text color={l.color}>{s}</Text> : <Text>{s}</Text>
}
const pctLen = (l: Lim) => `${l.r.percentUsed}%`.length + (l.g.ahead ? 1 : 0)

// `$1.23 · cache 94% · compacted ×2 · ◑ high`, the parts that are known, dropping from the end to fit `budget`.
function statsText(x: SessionExtras, budget: number, withCompactions = true): string {
  const parts = [
    x.costUsd !== undefined ? fmtUsd(x.costUsd) : '',
    typeof x.cacheHit === 'number' ? `cache ${x.cacheHit}%` : '',
    withCompactions && x.compactions > 0 ? `compacted ×${x.compactions}` : '',
    x.effort ?? '',
  ].filter(Boolean)
  while (parts.length && parts.join(' · ').length > budget) parts.pop()
  return parts.join(' · ')
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function renderBand(input: BandInput) {
  const { ui, usage, breakdown: b, columns, maxRows, expanded, now, options: o, extras, onToggle } = input
  const { Box, Text, Button } = ui
  const shown = gradeLimits(usage.rateLimits ?? [], now).filter(l => isShown(l, o))
  const free = b.categories.find((c: Category) => c.kind === 'free')?.tokens ?? 0
  const toggle = (label: string) => <Button key="toggle" plain dimColor label={label} onPress={onToggle} />

  if (expanded && columns >= 50) {
    const wide = columns >= 80
    const compactAt = b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined
    const ctxTail =
      `  ${fmtTokens(b.totalTokens)} / ${fmtTokens(b.maxTokens)} · ${b.percentage}%` +
      (wide && compactAt ? ` · compacts at ${fmtTokens(compactAt)}` : '')
    const limits = shown.map(l => ({ l, rest: resetPart(l.r, now, true, o.resetStyle) }))
    const legendItems = b.categories.filter((c: Category) => c.kind === 'used' && c.tokens > 0)
    const stats = o.sessionStats ? statsText(extras, columns - LABEL) : ''
    const baseRows = 1 + limits.length + (legendItems.length ? 1 : 0)
    // The stats row goes first when rows are short; then the band falls back to one line.
    const withStats = !!stats && baseRows + 1 <= maxRows
    if (baseRows <= maxRows) {
      const tailMax = Math.max(ctxTail.length + 2, ...limits.map(x => 2 + pctLen(x.l) + x.rest.length))
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
          {limits.map(({ l, rest }) => (
            <Box flexDirection="row">
              {label(labelOf(l.r.kind))}
              {runs(Text, limitCells(l.r.percentUsed, W, l.color))}
              <Text>{'  '}</Text>
              {pctText(Text, l)}
              <Text>{rest}</Text>
            </Box>
          ))}
          {withStats && (
            <Box flexDirection="row">
              {label('session')}
              <Text dimColor>{stats}</Text>
            </Box>
          )}
        </Box>
      )
    }
  }

  // Collapsed: one row. Optional parts drop until it fits: the session stats first, then the
  // extra windows from the end, then the 5h window, then free tokens.
  const segs = shown
    .filter(l => inCollapsed(l, o))
    .map(l => ({ l, label: `  ${labelOf(l.r.kind, true)} `, rest: resetPart(l.r, now, false, o.resetStyle) }))
  const ctxTail = ` ${b.percentage}%`
  const freeTail = ` · ${fmtTokens(free)} free`
  const statsFull = o.sessionStats ? statsText(extras, Infinity, false) : ''
  const statsTail = statsFull ? ` · ${statsFull}` : ''
  const base = 2 + 4 + ctxTail.length
  const segLen = (s: (typeof segs)[number]) => s.label.length + pctLen(s.l) + 1 + s.rest.length
  const plans: [n: number, withFree: boolean, withStats: boolean][] = []
  for (let n = segs.length; n >= 0; n--) {
    if (n === segs.length && statsTail) plans.push([n, true, true])
    plans.push([n, true, false])
  }
  plans.push([0, false, false])
  const availOf = ([n, withFree, withStats]: (typeof plans)[number]) =>
    columns - base - (withFree ? freeTail.length : 0) - (withStats ? statsTail.length : 0) -
    segs.slice(0, n).reduce((sum, s) => sum + segLen(s), 0)
  const need = ([n, withFree]: (typeof plans)[number]) => (n > 0 ? 10 + 6 * n : withFree ? 6 : 0)
  const plan = plans.find(p => availOf(p) >= need(p)) ?? plans[plans.length - 1]!
  const [n, withFree, withStats] = plan
  const avail = availOf(plan)
  const ctxW = n > 0 ? clamp(Math.floor(avail * (n === 1 ? 0.65 : 0.5)), 6, Math.min(40, avail - 6 * n)) : clamp(avail, 4, 40)
  const limW = n > 0 ? Math.min(16, Math.floor((avail - ctxW) / n)) : 0
  return (
    <Box flexDirection="row">
      <Text dimColor>ctx </Text>
      {runs(Text, contextCells(b, ctxW))}
      <Text>{ctxTail}</Text>
      {withFree && <Text dimColor>{freeTail}</Text>}
      {withStats && <Text dimColor>{statsTail}</Text>}
      {segs.slice(0, n).map(s => (
        <Box flexDirection="row">
          <Text dimColor>{s.label}</Text>
          {runs(Text, limitCells(s.l.r.percentUsed, limW, s.l.color))}
          <Text> </Text>
          {pctText(Text, s.l)}
          <Text>{s.rest}</Text>
        </Box>
      ))}
      <Text> </Text>
      {toggle('+')}
    </Box>
  )
}
