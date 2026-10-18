#!/usr/bin/env bash
# Eval scaffold: a tiny Express + TypeScript API with users routes, a db module and tests.
set -euo pipefail
mkdir -p src/routes src/db test
cat > package.json <<'J'
{ "name": "users-api", "private": true, "type": "module",
  "scripts": { "test": "vitest run" },
  "dependencies": { "express": "^5.1.0" },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^3.0.0", "supertest": "^7.0.0" } }
J
cat > src/db/users.ts <<'J'
export type User = { id: number; email: string; createdAt: string }
const users: User[] = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, email: `u${i + 1}@example.com`, createdAt: new Date(2024, 0, 1 + i).toISOString() }))
export async function listUsers(): Promise<User[]> { return users }
export async function getUser(id: number): Promise<User | undefined> { return users.find((u) => u.id === id) }
J
cat > src/routes/users.ts <<'J'
import { Router } from 'express'
import { getUser, listUsers } from '../db/users.js'
export const users = Router()
users.get('/users', async (_req, res) => { res.json(await listUsers()) })
users.get('/users/:id', async (req, res) => {
  const user = await getUser(Number(req.params.id))
  if (!user) return res.status(404).json({ error: 'not found' })
  res.json(user)
})
J
cat > src/app.ts <<'J'
import express from 'express'
import { users } from './routes/users.js'
export const app = express()
app.use(express.json())
app.use(users)
J
cat > test/users.test.ts <<'J'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
describe('users', () => {
  it('gets one user', async () => { const r = await request(app).get('/users/1'); expect(r.body.id).toBe(1) })
})
J
git init -q && git add -A && git -c user.email=e@x -c user.name=e commit -qm init
mkdir -p src/payments .github/workflows infra
cat > src/payments/webhook.ts <<'J'
import { db } from './store.js'
// Called once per provider delivery; providers retry, so one payment can arrive twice at once.
export async function onPaymentSucceeded(event: { id: string; paymentId: string; amount: number }) {
  const payment = await db.payments.find(event.paymentId)
  if (payment.status !== 'paid') {
    await db.ledger.charge(payment.customerId, event.amount)
    await db.payments.update(event.paymentId, { status: 'paid' })
  }
}
J
cat > src/payments/store.ts <<'J'
export const db: any = {}
J
cat > .github/workflows/ci.yml <<'J'
name: ci
on: [push, pull_request_target]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { ref: ${{ github.event.pull_request.head.sha }} }
      - uses: some-org/setup-node-cache@main
      - run: npm ci && npm test
J
cat > infra/main.tf <<'J'
provider "aws" { region = "us-east-1" }
resource "aws_ecs_service" "api" { name = "users-api" }
J
git add -A && git -c user.email=e@x -c user.name=e commit -qm "payments, ci, infra"
