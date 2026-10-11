// Ingest and query for tool-mgr, with the @duckdb/node-api library. Run by node.
//   - As a classic Stop / SessionEnd hook (stdin is the hook input JSON): ingest, quietly, exit 0.
//   - From the /tool-mgr command (stdin is {"kind":"summary"|"blocked"|"query", ...}): ingest, then answer as a text table.
// The JSONL logs under ${CLAUDE_PLUGIN_DATA}/logs are the source of truth; metrics.duckdb is a rebuildable index of them.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// The database and anything else this writes hold raw commands from the logs: owner only.
process.umask(0o077)

const COLUMNS =
  "{id:'VARCHAR', ts:'VARCHAR', session:'VARCHAR', agent:'VARCHAR', agent_type:'VARCHAR', permission_mode:'VARCHAR', tool:'VARCHAR', tool_use_id:'VARCHAR', cwd:'VARCHAR', command:'VARCHAR', summary:'VARCHAR', blocked:'VARCHAR', isError:'BOOLEAN'}"

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS calls (id VARCHAR, ts TIMESTAMP, session VARCHAR, agent VARCHAR, agent_type VARCHAR, permission_mode VARCHAR, tool VARCHAR, tool_use_id VARCHAR, cwd VARCHAR, command VARCHAR, summary VARCHAR, blocked VARCHAR, is_error BOOLEAN)`

const ingestSql = logs => `INSERT INTO calls
SELECT id, TRY_CAST(ts AS TIMESTAMP), session, agent, agent_type, permission_mode, tool, tool_use_id, cwd, command, summary, blocked, isError
FROM read_json('${logs.replaceAll("'", "''")}/**/*.jsonl', format = 'newline_delimited', columns = ${COLUMNS}, ignore_errors = true) r
WHERE id IS NOT NULL AND TRY_CAST(ts AS TIMESTAMP) IS NOT NULL AND id NOT IN (SELECT id FROM calls)
QUALIFY row_number() OVER (PARTITION BY id ORDER BY (blocked IS NULL), ts) = 1`

// ts is naive UTC: TIMESTAMPTZ arithmetic needs the ICU extension, which the read-only session (no external access) cannot load.
const summary = cutoff => [
  ['Calls per tool', `SELECT tool, count(*) AS all_time, count(*) FILTER (WHERE ts > TIMESTAMP '${cutoff}') AS last_7d FROM calls GROUP BY tool ORDER BY all_time DESC`],
  ['Blocked calls per rule', `SELECT blocked AS rule, count(*) AS all_time, count(*) FILTER (WHERE ts > TIMESTAMP '${cutoff}') AS last_7d FROM calls WHERE blocked IS NOT NULL GROUP BY blocked ORDER BY all_time DESC`],
  ['Calls per session and agent', `SELECT session, coalesce(agent, 'main') AS agent, count(*) AS all_time, count(*) FILTER (WHERE ts > TIMESTAMP '${cutoff}') AS last_7d FROM calls GROUP BY session, agent ORDER BY all_time DESC LIMIT 20`],
]

const blockedSql = n =>
  `SELECT ts, blocked AS rule, substr(replace(command, chr(10), ' '), 1, 200) AS command FROM calls WHERE blocked IS NOT NULL ORDER BY ts DESC LIMIT ${Math.trunc(n)}`

// DuckDB's text when another process holds the file: "Could not set lock on file ...: Conflicting lock is held in ... (PID n)".
export const isLocked = message => /Could not set lock on file|Conflicting lock is held/i.test(message)

function loadDuckdb(data) {
  for (const base of [join(data, 'package.json'), import.meta.url]) {
    try {
      return createRequire(base)('@duckdb/node-api')
    } catch {
      // try the next place
    }
  }
  throw new Error('the @duckdb/node-api library is not installed; the SessionStart hook installs it into the plugin data dir')
}

const hasJsonl = dir => {
  try {
    return readdirSync(dir, { recursive: true }).some(f => String(f).endsWith('.jsonl'))
  } catch {
    return false
  }
}

const MAX_ROWS = 500

// Renders a result as an aligned plain-text table, at most MAX_ROWS rows.
export function table(names, rows, truncated = false) {
  const shown = rows.slice(0, MAX_ROWS)
  const cells = shown.map(r => names.map(n => String(r[n] ?? '').replace(/\s+/g, ' ')))
  const widths = names.map(n => n.length)
  for (const c of cells) for (let i = 0; i < c.length; i++) if (c[i].length > widths[i]) widths[i] = c[i].length
  const line = c => c.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd()
  const out = [line(names), line(widths.map(w => '-'.repeat(w))), ...cells.map(line)]
  if (truncated || rows.length > MAX_ROWS) out.push(`[showing the first ${MAX_ROWS} rows]`)
  return out.join('\n')
}

async function show(conn, sql) {
  const reader = await conn.runAndReadUntil(sql, MAX_ROWS + 1)
  const names = reader.columnNames()
  return names.length === 0 ? '(ok)' : table(names, reader.getRowObjectsJson(), !reader.done)
}

// Creates the table and loads log records it has not seen. Returns 'locked' when another process holds the file.
export async function ingest(data) {
  const { DuckDBInstance } = loadDuckdb(data)
  mkdirSync(data, { recursive: true })
  let instance
  try {
    instance = await DuckDBInstance.create(join(data, 'metrics.duckdb'))
    const conn = await instance.connect()
    await conn.run(SCHEMA_SQL)
    const logs = join(data, 'logs')
    if (hasJsonl(logs)) await conn.run(ingestSql(logs))
    conn.closeSync()
    return 'ok'
  } catch (err) {
    if (isLocked(String(err?.message ?? err))) return 'locked'
    throw err
  } finally {
    instance?.closeSync()
  }
}

// Read-only, with files, ATTACH, INSTALL/LOAD and configuration changes switched off, so a query cannot touch anything.
async function answer(data, request) {
  const { DuckDBInstance } = loadDuckdb(data)
  const instance = await DuckDBInstance.create(join(data, 'metrics.duckdb'), { access_mode: 'READ_ONLY' })
  try {
    const conn = await instance.connect()
    await conn.run('SET enable_external_access=false')
    await conn.run('SET lock_configuration=true')
    if (request.kind === 'blocked') return await show(conn, blockedSql(request.n))
    if (request.kind === 'query') {
      // Only one statement: a second one's result would be silently dropped.
      if ((await conn.extractStatements(request.sql)).count > 1) throw new Error('query takes one statement')
      return await show(conn, request.sql)
    }
    const parts = []
    const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19).replace("T", " ")
    for (const [title, sql] of summary(cutoff)) parts.push(`${title}\n${await show(conn, sql)}`)
    return parts.join('\n\n')
  } finally {
    instance.closeSync()
  }
}

// Returns the text to print and whether it is an error.
export async function run(input, data) {
  const request = input?.kind ? input : null
  const status = await ingest(data)
  if (!request) return { text: '', error: false }
  if (status === 'locked') return { text: 'metrics.duckdb is locked by another session; try again in a moment', error: true }
  if (!existsSync(join(data, 'metrics.duckdb'))) return { text: 'no metrics yet', error: true }
  try {
    return { text: await answer(data, request), error: false }
  } catch (err) {
    return { text: String(err?.message ?? err), error: true }
  }
}

async function main() {
  const data = process.env.CLAUDE_PLUGIN_DATA
  let text = ''
  let input = null
  try {
    let raw = ''
    for await (const chunk of process.stdin) raw += chunk
    try {
      input = JSON.parse(raw)
    } catch {
      // a hook with no usable input still just ingests
    }
    if (!data) throw new Error('CLAUDE_PLUGIN_DATA is not set')
    const out = await run(input, data)
    if (out.error) {
      console.error(out.text)
      process.exitCode = input?.kind ? 1 : 0
    } else if (out.text) console.log(out.text)
    return
  } catch (err) {
    text = String(err?.message ?? err)
  }
  // A hook (no request on stdin) fails open: never a blocking exit code.
  console.error(text)
  process.exitCode = input?.kind ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
