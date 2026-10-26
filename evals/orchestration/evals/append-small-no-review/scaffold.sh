#!/usr/bin/env bash
# Eval scaffold: a dependency-free Node API (node:http, node:test) with a README that documents the
# endpoints. `npm test` passes offline, so a coder can run it. Used by the append-* outcome cases.
set -euo pipefail
mkdir -p src/db src/routes test
cat > package.json <<'J'
{ "name": "users-api", "private": true, "type": "module",
  "scripts": { "test": "node --test" } }
J
cat > src/db/users.js <<'J'
const users = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1,
  email: `u${i + 1}@example.com`,
  createdAt: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(),
}))
export function listUsers() { return users }
export function getUser(id) { return users.find((u) => u.id === id) }
J
cat > src/routes/users.js <<'J'
import { getUser, listUsers } from '../db/users.js'
// Each handler returns [status, body].
export function listUsersRoute() { return [200, listUsers()] }
export function getUserRoute(id) {
  const user = getUser(id)
  return user ? [200, user] : [404, { error: 'not found' }]
}
J
cat > src/server.js <<'J'
import http from 'node:http'
import { getUserRoute, listUsersRoute } from './routes/users.js'
export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    let result = [404, { error: 'not found' }]
    if (req.method === 'GET' && url.pathname === '/users') result = listUsersRoute()
    const m = url.pathname.match(/^\/users\/(\d+)$/)
    if (req.method === 'GET' && m) result = getUserRoute(Number(m[1]))
    res.writeHead(result[0], { 'content-type': 'application/json' })
    res.end(JSON.stringify(result[1]))
  })
}
J
cat > test/users.test.js <<'J'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from '../src/server.js'
let server, base
before(async () => {
  server = createServer()
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())
test('gets one user', async () => {
  const r = await fetch(`${base}/users/1`)
  assert.equal(r.status, 200)
  assert.equal((await r.json()).id, 1)
})
test('lists users', async () => {
  const body = await (await fetch(`${base}/users`)).json()
  assert.ok(Array.isArray(body))
})
J
cat > README.md <<'J'
# users-api

A small dependency-free HTTP API for users. Run the tests with `npm test`.

## Endpoints

### GET /users

Returns every user as a JSON array of `{ id, email, createdAt }`.

### GET /users/:id

Returns one user, or 404 with `{ "error": "not found" }`.
J
git init -q && git add -A && git -c user.email=e@x -c user.name=e commit -qm init
