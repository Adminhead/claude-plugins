// plan-ledger: the pure parts of the spawn hook and the resume reminder (decisions 7 and 8 in docs/plans/goal-ledger.md).
// No `$` here. The prompt is model-controlled text, so it is cut to a bound before any pattern runs on it, and the hook
// only ever appends one fixed line to it: item text never goes into a prompt.
import { isObject } from './shared'
import type { Plan } from './types'

/** Only this much of a spawn prompt is searched for a reference. */
export const MAX_PROMPT_CHARS = 8192
/** A spawn's agent type is a name; anything longer is not one the hook touches. */
export const MAX_TYPE_CHARS = 200

/** The one line the hook appends to a reserved item's prompt. */
export const REMINDER = 'Read your task with plan get (plan-ref above) before starting.'

const PLAN_REF = /^plan-ref:\s*(p-[0-9a-z]{9}-[0-9a-z]{6})\/(s[0-9]{1,2})\s*$/

export type PlanRef = { plan: string; item: string }

/**
 * The first `plan-ref: <plan>/<item>` line of the first 8192 characters of `prompt`; null when there is none. A line the
 * cut ends in the middle of is dropped, so a longer item id (`s12`) can never be read as a shorter one (`s1`).
 */
export function parsePlanRef(prompt: string): PlanRef | null {
  if (typeof prompt !== 'string') return null
  let head = prompt.slice(0, MAX_PROMPT_CHARS)
  if (prompt.length > MAX_PROMPT_CHARS && !/[\r\n]/.test(prompt.charAt(MAX_PROMPT_CHARS))) {
    head = head.slice(0, Math.max(head.lastIndexOf('\n'), head.lastIndexOf('\r')) + 1)
  }
  for (const line of head.split(/\r\n|\r|\n/)) {
    const m = PLAN_REF.exec(line)
    if (m !== null) return { plan: m[1], item: m[2] }
  }
  return null
}

/** The reminder line to append to `prompt`, or null when the prompt already carries it. */
export function reminderLine(prompt: string): string | null {
  return typeof prompt === 'string' && prompt.includes(REMINDER) ? null : REMINDER
}

/** `prompt` with the reminder on a line of its own at the end (unchanged when it is already there). */
export function withReminder(prompt: string): string {
  const line = reminderLine(prompt)
  if (line === null) return prompt
  return `${prompt}${prompt === '' || prompt.endsWith('\n') ? '' : '\n'}${line}`
}

/**
 * Whether the spawn hook looks at this `agent.spawn` input at all: a fresh spawn from the orchestrator (the main loop, so
 * no `parentAgentId`), with a prompt and an agent type, that is not a resume (the engine ignores a rewrite of a resumed
 * run, and its binding stands) and not a workflow agent (its id is in no `$.agent.list()`, so it could never act on an item).
 */
export function isOrchestratorSpawn(e: unknown): boolean {
  if (!isObject(e)) return false
  if (e.parentAgentId !== undefined || e.resume !== undefined || e.workflow !== undefined) return false
  return typeof e.prompt === 'string' && typeof e.subagentType === 'string' && e.subagentType !== '' && e.subagentType.length <= MAX_TYPE_CHARS
}

/**
 * For a subagent that starts or resumes: one line naming the item bound to it, so a resumed agent re-reads its task. Null
 * when no live plan binds this agent to an item that is still open. A fresh spawn is not bound yet when this runs (the
 * spawn hook binds after the agent started), and its prompt carries the reference, so it gets nothing here. The newest
 * binding wins when an agent holds several.
 */
export function boundItemReminder(plans: Plan[], agentId: unknown): string | null {
  if (typeof agentId !== 'string' || agentId === '') return null
  let best: { plan: string; item: string; at: string } | null = null
  for (const plan of plans) {
    if (plan.status === 'abandoned') continue
    for (const item of plan.items) {
      const b = item.boundAgent
      if (!isObject(b) || b.agentId !== agentId) continue
      if (item.status === 'verified' || item.status === 'abandoned') continue
      const at = typeof b.at === 'string' ? b.at : ''
      if (best === null || at > best.at) best = { plan: plan.id, item: item.id, at }
    }
  }
  return best === null ? null : `[plan-ledger] plan-ref: ${best.plan}/${best.item} is your item. Re-read it with plan get before you continue.`
}
