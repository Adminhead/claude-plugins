# Official guidance that applies to agent prompts

Condensed 2026-10-17 from:

- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices (redirects to `claude-prompting-best-practices`; "Prompting best practices" for current Claude models)
- https://code.claude.com/docs/en/best-practices ("Best practices for Claude Code")
- https://code.claude.com/docs/en/sub-agents (its "Best practices" tip and "Choose between subagents and main conversation")

Each note says where it applies in a subagent file: description, body, or frontmatter.

## From the subagents doc

- **Design focused subagents**: each one excels at one task. (whole file)
- **Write descriptions that single out one subagent**: specific enough to route to the right one, within the 15,000-token combined budget. Move detail into the body, which loads only on use. (description)
- **Include "use proactively"** in the description to encourage unprompted delegation. (description)
- **Limit tool access**: grant only the necessary permissions, for security and focus. (frontmatter `tools`)
- **Check project subagents into version control.** (placement)
- **Use a subagent when** the task produces verbose output you don't need in main context, you want tool or permission restrictions, or the work is self-contained and returns a summary. **Use the main conversation when** the task needs back-and-forth, phases share significant context, the change is small, or latency matters. **Consider a skill instead** for reusable prompts that should run in the main context. (decision)
- **The main conversation keeps its CLAUDE.md** when it reads the result, so most rules needn't reach the subagent. A rule that must (such as "ignore `vendor/`") is restated in the delegation prompt. (body vs delegation prompt)
- **Hooks are a backstop, not the instruction**: the db-reader example tells the subagent in the body that it has read-only access, and the `PreToolUse` hook blocks writes if it tries anyway. (body + frontmatter)
- **Memory**: `project` scope is the recommended default; put "update your agent memory as you discover ..." in the body so it maintains its own notes. (body + frontmatter `memory`)

## From the prompting best-practices page

### General principles (body)

- **Be clear and direct.** Treat the model as a brilliant new employee with no context on your norms. Golden rule: if a colleague with minimal context would be confused by the prompt, so will Claude.
- **Explain why.** A reason ("your output is read by a parser, so return only the block") generalises better than a bare rule ("NEVER add preamble").
- **Use examples** when the output shape matters: relevant, diverse, wrapped in `<example>` tags so they're distinct from instructions. Three to five is the sweet spot.
- **Structure with XML tags** when the prompt mixes instructions, context, and data. Consistent tag names; nest when there's hierarchy.
- **Give a role.** One sentence in the system prompt focuses behaviour and tone.
- **Long inputs at the top, the ask at the end.** If the body embeds reference material, put it before the procedure. Ask the model to quote relevant parts first when it must work from long documents.

### Output and formatting (body, output contract)

- **Say what to do, not what not to do**: "respond in flowing prose" beats "do not use markdown".
- **Match prompt style to desired output**: a body full of bullets yields bullets.
- **Prefill is gone**; constrain format with direct instruction ("Respond directly without preamble"), XML tags, or a fixed template.
- Current models are **less verbose by default** and may skip summaries after tool calls. If the parent needs a summary, ask for one explicitly. Fable 5.1 writes fewer updates during agentic work; Opus 5 writes more.

### Tool use (body)

- **Be explicit about action.** "Suggest changes" gets suggestions; "change this function" gets edits. Use `<default_to_action>` or `<do_not_act_before_instructions>` style blocks to set the default.
- **Dial back aggressive language.** Opus 4.5+ responds strongly to the system prompt; "CRITICAL: You MUST use this tool when..." now overtriggers. Write "Use this tool when...". Applies to descriptions too.
- **Parallel tool calls** happen by default; a short instruction can push them to near 100% for independent reads. Don't ask for parallelism where calls depend on earlier results.

### Thinking (body)

- **Prefer general instructions** ("think thoroughly about the failure before editing") to hand-written step-by-step reasoning scripts; the model's own reasoning often exceeds the script.
- **Don't ask for reasoning in `<thinking>` tags** on Fable 5.1, Fable 5, Opus 5.5, Opus 5, Sonnet 5.5; it may be declined. Use the `effort` field instead.
- **Ask for a self-check** ("Before you finish, verify the result against ...") on most models. Opus 5 is the exception: it over-verifies when told to; remove such lines for it.
- If it over-explores, tell it to **pick an approach and commit**, or lower `effort`.

### Agentic systems (body)

- **Verification tools**: as autonomous runs get longer, the agent needs a check it can run itself. Name it in the procedure.
- **Reversibility**: for anything hard to reverse or visible to others (deleting, force-pushing, posting, modifying shared infrastructure) tell it to stop rather than proceed, and never to bypass safety checks (`--no-verify`) as a shortcut. A subagent cannot ask the user, so the instruction is "stop and report", not "confirm with the user".
- **Research**: give success criteria; ask for source verification; for complex research ask it to track competing hypotheses and confidence.
- **Subagent orchestration**: current models delegate readily and sometimes overuse subagents (spawning one where a grep would do). If the agent you're writing can itself spawn subagents, say when that is and isn't warranted; otherwise omit `Agent` from `tools`.
- **Avoid over-engineering**: no extra features, refactors, docstrings on untouched code, defensive handling for impossible cases, or abstractions for one-time operations. Quote the doc's block when a worker tends to gold-plate.
- **Don't game tests**: implement the general solution, don't hard-code for test inputs, don't write helper scripts as a workaround, and report an incorrect test rather than working around it.
- **Investigate before answering**: never speculate about code not opened; read the named file before answering. Put this in every reviewer or scout body.
- **Clean up temporary files** at the end of the task if you want none left behind.

## From the Claude Code best-practices page

- **Context is the constraint.** Performance degrades as the window fills; subagents exist to keep exploration and verbose output out of the main window and return summaries. The report is the product; design the output contract for the parent's needs. (output contract)
- **Give Claude a way to verify its work**: tests, a build exit code, a linter, a diff against a fixture, a screenshot. Have it show evidence, not assert success. A subagent is also one of the ways to verify: "a fresh model tries to refute the result, so the agent doing the work isn't the one grading it." (body)
- **Adversarial review**: the reviewer sees only the diff and the criteria, not the reasoning that produced the change. Name the work, the plan to check against, and what counts as a finding. **Tell it to flag only gaps that affect correctness or the stated requirements**, because a reviewer asked to find gaps will report some even when the work is sound, and chasing them produces over-engineering. (reviewer body)
- **Scope investigations**: "investigate X" without scope reads hundreds of files. Either scope narrowly or use a subagent so the exploration doesn't consume the main context. The subagent itself should still be told the scope. (description and delegation prompt)
- **Provide specific context**: name files, constraints, and example patterns; describe the symptom, the likely location, and what "fixed" looks like. These belong in the delegation prompt, and the body should say what to do when they're missing. (body inputs section)
- **CLAUDE.md pruning test applies to bodies**: for each line ask "would removing this cause a mistake?" If not, cut it. Emphasis ("IMPORTANT") on one line works; on many lines none stands out. (body)
- **Hooks for things that must happen every time.** Advisory text in a body can be ignored; a hook is deterministic. Use a `PreToolUse` hook (in `settings.json`, or in frontmatter for non-plugin agents) when a boundary is a hard requirement. (frontmatter)
- **Skills for domain knowledge**: knowledge that applies only sometimes goes in a skill, loaded on demand, not in every prompt. For a subagent, that means `skills:` preload rather than pasted text. (frontmatter)
- **Fan-out pattern**: unattended batch runs use `--allowedTools` and `--permission-mode dontAsk`; a worker subagent written for such runs should return a one-line machine-readable result (`OK`/`FAIL`) first. (output contract)
- **Writer/Reviewer split**: a fresh context reviews better because it isn't biased toward code it just wrote. That's the case for a separate reviewer subagent rather than a self-review step. (decision)
