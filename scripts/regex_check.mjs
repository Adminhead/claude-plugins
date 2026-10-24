#!/usr/bin/env node
// Batch regex checker for scripts/plugins.py. Reads JSON on stdin:
//   { "items": [{ "pattern": str, "flags": str, "skill": bool }],
//     "skills": [{ "id": str, "tests": [str] }] }
// and writes one result per item to stdout, in order:
//   { "error": "<message>" }                      when `new RegExp(pattern, flags)` throws
//   { "matched": ["<skill id>", ...] }            otherwise (only filled for items with "skill": true)
// The eval runner compiles patterns as JavaScript, so this uses the same engine.
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8'))
const skills = input.skills ?? []

const results = (input.items ?? []).map((item) => {
  let re
  try {
    re = new RegExp(item.pattern, item.flags ?? '')
  } catch (e) {
    return { error: String(e.message ?? e) }
  }
  const matched = []
  if (item.skill) {
    for (const skill of skills) {
      for (const test of skill.tests) {
        re.lastIndex = 0
        if (re.test(test)) {
          matched.push(skill.id)
          break
        }
      }
    }
  }
  return { matched }
})

process.stdout.write(JSON.stringify(results))
