// agent-router: appends a routing table of the installed agent types to the Agent tool's
// description, only when the main thread runs the orchestration agent.
//
// Event order, checked live on Claude Code 2.1.302 (`claude -p --agent <plugin>:<agent>` with a
// probe mod): classic.SessionStart (agent_type set, no agent_id) -> session.start ->
// prompt.context -> agent.offer for every listed type -> prompt.section -> classic.UserPromptSubmit
// -> turn.start -> tool.describe{Agent}. The offers come before the Agent tool is described, so
// the table is complete at its first render.
//
// Why tool.describe and not prompt.section: with --agent the only engine section is
// env_info_model, and sections are cached per session and reused in subagents' system prompts
// (a marker added there reached a general-purpose subagent). The Agent tool's description reaches
// only agents that can spawn, and the main thread first.

import type { Register } from 'claude-code'
import { isOrchestrator, MAX_NAME, MAX_TRACKED, renderTable, withTable, type Offer } from './routes'

export const register: Register = (on) => {
  // Every type the model was offered, by name; a type a hook beneath refused is dropped.
  const offers = new Map<string, Offer>()
  // The main thread's agent type, from the classic hook inputs (main thread: agent_type, no agent_id).
  let mainAgent: string | undefined
  // The table last put into the Agent tool's description; undefined until the first render.
  let rendered: string | null | undefined

  const noteMain = (e: { agent_type?: unknown; agent_id?: unknown }) => {
    if (e.agent_id === undefined && typeof e.agent_type === 'string' && e.agent_type.length <= MAX_NAME) {
      mainAgent = e.agent_type
    }
  }

  on('classic.SessionStart', ($, e, next) => {
    noteMain(e)
    return next(e)
  })

  on('classic.UserPromptSubmit', ($, e, next) => {
    noteMain(e)
    return next(e)
  })

  on('agent.offer', async ($, e, next) => {
    const out = await next(e)
    if (out.isOffered) {
      if (offers.has(e.agent) || offers.size < MAX_TRACKED) {
        offers.set(e.agent, {
          agent: e.agent,
          description: String(e.description ?? '').slice(0, 4000),
          source: e.source,
          provider: e.provider?.plugin ?? '',
        })
      }
    } else {
      offers.delete(e.agent)
    }
    // A type installed or removed mid-session: redescribe the Agent tool once the table changed.
    if (rendered !== undefined && rendered !== null && renderTable(offers.values()) !== rendered) {
      rendered = undefined
      $.ui.invalidate('tool.describe')
    }
    return out
  })

  on('tool.describe', { tool: 'Agent' }, async ($, e, next) => {
    const out = await next(e)
    let main = mainAgent
    if (main === undefined) {
      // The `agent` setting starts the session as that agent too; read it when no hook said.
      const agent = (await $.settings.read().catch(() => ({}) as Record<string, unknown>))?.agent
      if (typeof agent === 'string') main = agent
    }
    if (!isOrchestrator(main)) {
      rendered = null
      return out
    }
    const table = renderTable(offers.values())
    rendered = table
    return { ...out, description: withTable(out.description, table) }
  })
}
