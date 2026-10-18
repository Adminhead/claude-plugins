import { describe, expect, test } from 'claude-code/testing'
import { analyze } from '../hooks/danger/rules'
import { destroysData, sqlFiles, sqlPath, uncheckedMessage } from '../hooks/danger/sqlfile'
import { withAsk } from '../hooks/danger/rules'

const files = (c: string) => {
  const { hit, scan } = analyze(c)
  if (hit || !scan) throw new Error(`unexpected hit for ${c}`)
  return sqlFiles(scan.commands)
}

describe('sqlFiles', () => {
  test('script files fed to database clients are found', () => {
    expect(files('psql -f drop.sql')).toEqual(['drop.sql'])
    expect(files('psql -d app --file=migrations/1.sql')).toEqual(['migrations/1.sql'])
    expect(files('psql --file x.sql -fy.sql')).toEqual(['x.sql', 'y.sql'])
    expect(files('mysql app < dump.sql')).toEqual(['dump.sql'])
    expect(files('sqlite3 app.db < schema.sql')).toEqual(['schema.sql'])
    expect(files("psql -c '\\i reset.sql'")).toEqual(['reset.sql'])
    expect(files('psql app <<EOF\n\\ir sub/x.sql\nEOF')).toEqual(['sub/x.sql'])
    expect(files('mysql -e "source /srv/x.sql"')).toEqual(['/srv/x.sql'])
    expect(files("sqlite3 app.db '.read seed.sql'")).toEqual(['seed.sql'])
    expect(files('cat wipe.sql | psql app')).toEqual(['wipe.sql'])
    expect(files('redis-cli < cmds.txt')).toEqual(['cmds.txt'])
    expect(files('timeout 60 psql -f a.sql')).toEqual(['a.sql'])
    expect(files('psql -f "$F"')).toEqual([null])
    expect(files('psql < "$F"')).toEqual([null])
  })

  test('the pass column: no script file, or not a database client', () => {
    for (const c of ["psql -c 'select 1'", 'psql app <<EOF\nselect source from t;\nEOF', 'grep -f patterns.txt x', 'wc -l < dump.sql', 'psql < <(echo select 1)', 'cat x.sql', 'mysql -e "select 1"']) {
      expect([c, files(c)]).toEqual([c, []])
    }
  })
})

describe('destroysData and sqlPath', () => {
  test('destructive script text', () => {
    for (const t of ['DROP TABLE users;', 'begin;\ntruncate orders;\ncommit;', 'drop database app', 'FLUSHALL', 'flushdb']) expect([t, destroysData(t)]).toEqual([t, true])
    for (const t of ['select 1;', 'ALTER TABLE t DROP COLUMN c;', 'DROP INDEX i;', 'insert into flushes values (1);', 'CREATE TABLE truncated_rows (id int);']) expect([t, destroysData(t)]).toEqual([t, false])
  })

  test('paths resolve against the session directory, and ~ or expansions cannot be placed', () => {
    expect(sqlPath('x.sql', '/w/')).toBe('/w/x.sql')
    expect(sqlPath('/abs/x.sql', '/w')).toBe('/abs/x.sql')
    expect(sqlPath('~/x.sql', '/w')).toBeNull()
    expect(sqlPath(null, '/w')).toBeNull()
  })
})

describe('the sql-unchecked ask', () => {
  test('names the file, one capped line', () => {
    expect(uncheckedMessage('drop.sql')).toBe("bash-rules: couldn't check drop.sql for DROP/TRUNCATE; confirm it's safe.")
    expect(uncheckedMessage(null)).toMatch(/a SQL script file built from an expansion/)
    const m = uncheckedMessage('a\nb' + 'x'.repeat(300))
    expect(m).not.toContain('\n')
    expect(m.length).toBeLessThan(160)
  })

  test('withAsk uses the extra ask only when the rules find none, and a deny below still wins', async () => {
    const extra = async () => ({ rule: 'sql-unchecked' as const, message: uncheckedMessage('x.sql') })
    expect(await withAsk('psql -f x.sql', async () => undefined, () => {}, undefined, extra)).toEqual({ ask: expect.stringMatching(/couldn't check x\.sql/) })
    expect(await withAsk('psql -f x.sql', async () => ({ allow: true }), () => {}, undefined, extra)).toEqual({ ask: expect.any(String) })
    expect(await withAsk('psql -f x.sql', async () => ({ deny: 'no' }), () => {}, undefined, extra)).toEqual({ deny: 'no' })
    expect(await withAsk('git push -f', async () => undefined, () => {}, undefined, extra)).toEqual({ ask: expect.stringMatching(/force-pushes/) })
    expect(await withAsk('psql -f x.sql', async () => undefined, () => {}, undefined, async () => null)).toEqual({})
    // An extra check that throws leaves no ask and is reported.
    const log: string[] = []
    expect(await withAsk('psql -f x.sql', async () => undefined, e => log.push(String(e)), undefined, async () => { throw new Error('fs') })).toEqual({})
    expect(log).toHaveLength(1)
  })
})
