# G8 API design, auth, security, design and UX, MCP and agent config, 2026-11-14

Scope: 30 plugins. Read-only. I read every SKILL.md in full and the bundled scripts for security-scan, mcp-server-audit and uiux-lookup. References (about 2,500 lines across the family) I checked by structure, dead-link scan and targeted greps, not line by line. Anything I assert about reference content is marked as such.

Checks run: `uv run --with pytest pytest plugins/security-scan/skills/security-scan/tests` 55 passed. `python3 -I -m unittest` for mcp-server-audit 7 passed. `bun test plugins/uiux-lookup/tests/` 20 passed. A script scan of all 30 SKILL.md files found no dead reference links. Every description is 282 to 361 characters, so none is at risk from the 500-character truncation.

## Summary

- Verdict counts: KEEP 4, KEEP-FIX 15, SLIM 3, MERGE 1, DEPRECATE 7.
- security-scan is the clearest keeper in the group (Tooling). V11 (pip-audit running branch code) is FIXED in 0.2.x. The OWASP ID errors and the passkey/NIST gap in app-auth are still open.
- ui-direction has the only measured lift (five outcome cases at 1.0 against 0.4). That lift is weaker evidence than it looks: the judge rubric restates the skill's own "defaults" table, and the 0.4 baseline is just the two cheap graders (page exists, no lorem) passing with the judge failing. See the plugin entry. It was listed in 41 sessions and never called, and so were ux-copy, accessibility-review and screen-reader-testing. web-design was called once. The cause is mostly that the owner's web sessions are not design tasks, not that the descriptions fail to trigger.
- Seven plugins are textbook or upstream ports with no private knowledge and no measured value: design-critique, design-handoff, design-system, ux-copy, accessibility-review, privacy-review, file-conversion. Deprecating them also removes the name collision with Anthropic's `design` plugin.
- The seven api-* skills plus app-auth are mostly mainstream. Each has a handful of sharp, non-obvious lines (quoted below) worth keeping, but none is installed in any meta (api-* listed in 0 to 18 sessions, 0 calls) and none has outcome evals. Verdicts lean SLIM or KEEP-FIX at low or medium confidence.
- agent-config-audit, config-audit and plugin-vetter are distinct enough (own config security, bloat, third-party vetting). The three mcp-server-* skills are distinct (build, review own code, audit third-party), and mcp-server-audit is the one with real tooling.
- All inert "not-other-plugin" graders from the prior review are gone, except `agent-instructions/evals/agent-instructions-trigger/graders/not-skill-authoring.md:4-6`, which still forbids a skill that cannot load in that suite.
- 29 of 30 plugins have no outcome evals. Plugins whose value is K-decision and have none include threat-model, app-auth, api-idempotency, api-oauth-provider, agent-config-audit and mcp-server.

## Prior findings re-checked

Source: `docs/research/plugin-review-2026-10-23/G8-api-security-design.md` and `docs/plans/plugin-review-fixes.md`.

| Prior finding | Status | Evidence |
| --- | --- | --- |
| security-scan runs pip-audit on branch code (V11, A5, high) | FIXED | `scanners.py:267` defines `PIN_FLAGS = ["--no-deps", "--disable-pip"]`. `inspect_requirements` (`:275`) rejects option lines and URL, VCS and path requirements. `:345` adds a gap for lock-less projects. `SKILL.md:63` documents all of it. Commits 07a7d673 and 6ef56235. plugin.json is 0.2.2. |
| security-scan `SKILL.md` says to rerun tests with pytest, no dependency note (low) | STILL OPEN | `security-scan/skills/security-scan/SKILL.md:62`. The tests do pass under `uv run --with pytest`. Add that command. |
| Wrong OWASP Top 10:2025 IDs in security-scan (med, F8) | STILL OPEN (needs source check) | `references/vuln-categories.md:27` XXE tagged [A05]; `:38` file uploads [A05]; `:35` postMessage [A01]; `:44` default credentials [A02]. The prior review says 2025 maps XXE to A02, uploads to A06 and postMessage and default credentials to A07. I did not re-verify against owasp.org. |
| app-auth lacks passkeys, NIST 800-63B-4 password rules, MFA recovery, RFC 9207 client rules, SPA token storage (med, F8) | STILL OPEN | `grep -i "passkey\|webauthn\|800-63"` finds only better-auth mentions (`better-auth/skills/better-auth/SKILL.md:25,60`). `app-auth/skills/app-auth/SKILL.md` has no match. |
| app-auth `nonce` without ID-token `aud`/`azp` (low) | STILL OPEN | `app-auth/SKILL.md:36`. |
| Five ported design skills collide by name with Anthropic's `design` plugin (med) | PARTLY | Names are unchanged (`accessibility-review`, `design-critique`, `design-handoff`, `design-system`, `ux-copy`). But the official `design` plugin is not in `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/` (the list has `frontend-design`, not `design`), and no `design:*` skills appear in this session's skill list. `docs/research/uiux-design.md:155` says it was provisioned through claude.ai. So the collision exists only in sessions where claude.ai syncs it. UNVERIFIED for the owner's other sessions. |
| Three plugins review `.mcp.json` (agent-config-audit, mcp-server-audit, plugin-vetter) (med) | PARTLY | Descriptions now cross-refer (`agent-config-audit/SKILL.md:12`, `mcp-server-audit/SKILL.md:10`, `plugin-vetter.md` boundary). But `mcp-server-audit/SKILL.md:25` step 2 still reviews unpinned `npx`/`uvx`/`@latest`, which line 10 says agent-config-audit owns. |
| security-scan not invocable by the model but threat-model routes to it (med) | FIXED | `threat-model/SKILL.md:10` now lists `security-scan` only in a "Not for" clause. `security-auditor.md` tells the reader to use the `/security-scan:security-scan` form. |
| threat-model has no in-body attribution (low) | FIXED | Commit ca454115 (2026-11-06) moved attribution to NOTICE across plugins. |
| `api-grpc/LICENSE.hdr` empty and committed (low) | STILL OPEN | `git ls-files` lists it; `wc -c` is 0. |
| Inert not-neighbour hard negatives (high; V26) | FIXED for 10 of 11 | The `max: 0` graders in api-keys, api-oauth-provider, api-rest-design, api-idempotency, api-webhooks, mcp-server, mcp-server-audit, agent-config-audit and click-path-audit are gone; each suite now has only a `fires` grader. Not fixed: `agent-instructions/evals/agent-instructions-trigger/graders/not-skill-authoring.md:4-6`. |
| api-webhooks excludes receiving third-party webhooks and no group skill owns it (med) | STILL OPEN | `api-webhooks/SKILL.md:8`. `api-idempotency/SKILL.md:8` says it is "not for webhook delivery retries" while api-webhooks line 8 routes consumer dedupe to api-idempotency. Nobody owns consumer-side verification. |
| api-oauth-provider: `device_authorization` with no phishing caveat; `plain` PKCE fallback (low) | STILL OPEN | `api-oauth-provider/SKILL.md:21,23`. |
| api-keys: mention HMAC-with-pepper option; add "API keys you issue go to api-keys" to app-auth (low) | STILL OPEN | `api-keys/SKILL.md:38-41`; `app-auth/SKILL.md:19` does name api-keys, so the second half is FIXED. |
| api-graphql: clamp `first`/`last` (low) | PARTLY | `api-graphql/SKILL.md:46` clamps `first`, `last` is not mentioned. |
| ui-direction `SKILL.md:70` calls `.section` a "type selector" (low) | STILL OPEN | Now `SKILL.md:68`: "a type selector like `.section` and an element selector like `.cta`". Both are class selectors. |
| ui-direction `page-exists` glob `**/index.html` vs content graders on root `index.html` (low) | STILL OPEN | `evals/outcome-*/graders/page-exists.md:3` against `judged-page.md:3` and `no-lorem.md:6`. |
| ui-direction `outcome-conference-format` 0.4/0.4 does not discriminate | STILL OPEN | Still 0.4/0.4 in the plugin data. |
| mcp-server-audit `pin_tools` collapses duplicate names (low) | STILL OPEN | `scripts/mcp_audit.py:145` builds a dict keyed by `t["name"]`. |
| mcp-server-audit `pin --out` fails when the parent directory is missing (low) | STILL OPEN | `mcp_audit.py:178` `open(args.out, "w")` with no `makedirs`. |
| agent-config-audit has no `autoMode.allow` check (med) | STILL OPEN | `agent-config-audit/SKILL.md:35` mentions `auto` as a mode only. |
| agent-instructions does not mention `/doctor prompt-audit` (med) | FIXED | `agent-instructions/skills/agent-instructions/references/loading.md:55`. Not in SKILL.md body. |
| accessibility-review severity scale differs from design-critique (low) | STILL OPEN (UNVERIFIED) | Not rechecked. Moot if both are deprecated. |
| 14 plugins with no evals; 9 with exactly one case | STILL OPEN | Only ui-direction has outcome cases. api-* suites have one `fires` grader each. |

Status counts: FIXED 5 (V11, threat-model routing, threat-model attribution, inert negatives (10 of 11 suites), agent-instructions `/doctor`), PARTLY 3, STILL OPEN 14 (several are low).

## Per-plugin

### security-scan: KEEP-FIX (high)
- Value: Tooling plus Enforcement. It is a manual command that runs gitleaks, semgrep (`p/default`), trivy, govulncheck and pip-audit through one script (`scripts/scan.py`, `scanners.py`, `normalize.py`, about 1,060 lines), normalizes findings to JSON with a mandatory `Not scanned:` gap line (`SKILL.md:27`), pins `govulncheck` and `pip-audit`, never builds branch code (V11 fix), and never prints secret values (`SKILL.md:40,48`). 55 tests pass.
- What it adds over the overlaps: built-in `/security-review` reads the diff in-model only. The `security-auditor` agent (`plugins/security-auditor/agents/security-auditor.md`, "you complement two other tools") is model-only too, going deeper on one area. The official `claude-security` plugin in `claude-plugins-official` is an agent pipeline (scan-inventory, scan-researcher, scan-verifier, patch-generator, and so on). My grep of it found no semgrep, gitleaks, trivy or govulncheck. Only security-scan puts deterministic scanner output and known-CVE dependency data into the review, so it finds committed secrets, vulnerable pinned versions and rule-based sinks that a model reading a diff misses. It also ships `references/ci-supply-chain.md` (GitHub Actions `pull_request_target`, script injection, OIDC) and `references/sbom.md`.
- Evidence: manual-only, 0 loads, 0 listings. Absence of loads in four weeks means the owner has not run it; that is not evidence of low value. No evals.
- Fixes:
  - [med] `references/vuln-categories.md:27,35,38,44`: OWASP 2025 IDs, see re-check table. Confirm against owasp.org/Top10/2025 first.
  - [low] `SKILL.md:62`: say `uv run --with pytest pytest tests` (pytest is not a project dependency).
  - [low] Add the `outcome-not-scanned` case the prior review proposed (planted fake AWS key, assert `Not scanned:` and that the key value is never printed). This is the only plugin here whose guarantee is a behavioral invariant, and it has no test of that behavior at model level.
  - [low] `SKILL.md:15` says `security-auditor` "if installed"; fine. Keep.

### api-graphql: SLIM (medium)
- Value: Generic with a few K-decision lines. Sonnet 5.5 without the skill designs a reasonable GraphQL schema (PascalCase types, input/payload types, Relay connections, DataLoader). Haiku probably also does. Non-obvious lines worth keeping:
  - `:54` "Adding a member to a shipped union is a dangerous change, since clients with exhaustive handling can break."
  - `:58` "An unauthorized field must behave the same whether or not the resource exists. If it nulls in one case and errors in the other, the response shape tells an attacker which resources exist."
  - `:76` "`Query._service { sdl }` returns the subgraph's full schema ... Turning off introspection doesn't remove either field."
  - `:84` "GraphQL.org says trusted documents can't be used for public APIs."
  - `:20` "For a public API the default is REST" (a gate that changes the answer).
- Evidence: 0 sessions listed, not in any meta, no evals. Absence of evidence.
- Fixes:
  - [low] `:46` also clamp `last`, and note `last` without `before` is expensive.
  - [low] Add the `outcome-result-unions` case.
- SLIM target: keep gate, errors, ceilings, federation boundary, persisted queries (about 55 of 99 lines). Cut the naming/Node ID bullets (`:28-35`) and the pagination basics (`:43-45`). Lost: reminders for Haiku. `references/schema-and-results.md` and `evolution.md` (147 lines) not read in full, UNVERIFIED.

### api-grpc: KEEP-FIX (low)
- Value: K-decision. The proto-diff review is a procedure that changes output (four dimensions: wire, named formats, source, behavior; verdict table at `:55-62`). Non-obvious lines: `:41` "Buf's breaking rules do not read custom options, so a change to a `google.api.http` annotation can break the REST mapping while every proto check stays green"; `:43` the `UNARY_RPC` lint category; `:80` "A response header commits the RPC and ends retry attempts." Most of `:25-30` (AIPs, reserved fields, `_UNSPECIFIED`) is textbook.
- Evidence: 1 session listed, 0 calls, no evals.
- Fixes:
  - [low] Delete the empty tracked `LICENSE.hdr`.
  - [low] Add the `trigger-proto-diff` and `outcome-tag-reuse` evals from the prior review.
  - [low] Buf defaults (STANDARD lint, FILE breaking) are dated "October 2026" (`:96`); needs source check.

### api-idempotency: KEEP-FIX (medium)
- Value: K-decision. Non-obvious: `:43` fencing a lock takeover with `lock_generation`; `:44` "A bare Redis `SETNX` with a TTL is not a lock for this purpose"; `:67` "A 24-hour window in front of a 7-day dead-letter replay is a duplicate waiting to happen"; `:14` the IETF draft is expired at revision 07. A model asked to "add Idempotency-Key" typically stores key and response and misses the atomic claim and in-flight state, so the audit checklist (`:89-100`) changes the result. This is the strongest of the api-* set.
- Evidence: 5 sessions listed, 0 calls, 1 routing eval.
- Fixes:
  - [med] Settle ownership of consumer-side dedupe of received webhooks. `:8` says "not for webhook delivery retries" while `api-webhooks/SKILL.md:8` sends consumers here.
  - [med] Add `outcome-atomic-claim` (seed a check-then-insert handler, require the race to be flagged).
  - [low] `Idempotency-Key` draft status (`:14`, "checked on datatracker 2026-10-17") needs source check.

### api-keys: MERGE into api-oauth-provider (low)
- Value: mostly Generic. `:41` "Use SHA-256, not argon2id or bcrypt: the key is high-entropy" corrects a common Haiku and sometimes Sonnet reflex. `:14-23` keys-versus-OAuth gate is a real decision aid ("If you find yourself adding expiry, per-request scopes, and fine-grained revocation to a static key, you are rebuilding OAuth"). The rest (prefix, checksum, scopes, rotation with two keys valid) is Stripe-style common practice.
- Evidence: 14 sessions listed, 0 calls, 1 routing eval (a trigger with no outcome).
- Proposal: move the keys-versus-OAuth gate, the SHA-256 rationale, dual-key rotation and the ownership checklist (about 30 lines) into `api-oauth-provider` as a "Keys instead of OAuth" section plus `references/storage-and-rotation.md` (68 lines). Both skills answer "how does a platform authenticate its API consumers". Lost: a separate trigger for "design our API key system", which a combined description can still carry. If the owner prefers to keep it, the verdict is KEEP-FIX with the HMAC-pepper line added.

### api-oauth-provider: KEEP-FIX (medium)
- Value: K-private (newer than training) plus K-decision. It carries facts a model gets wrong or does not have: `:29` RFC 9207 `iss` and the MCP 2026-07-28 expectation; `:30` RFC 9728 protected-resource metadata and RFC 8707 `resource`; `:37` "return the successor already issued ... and mint no new sibling" for the refresh grace window; `:67` Client ID Metadata Documents and deprecated DCR; `:8` OAuth 2.1 still a draft (revision 16). Sonnet 5.5 would likely propose rotation with reuse detection but not the grace window or CIMD handling.
- Evidence: 0 sessions listed, 1 routing eval.
- Fixes:
  - [low] `:21` add the RFC 8628 remote-phishing caveat for device flow.
  - [low] `:23` for MCP authorization servers the spec requires S256; drop the `plain` fallback sentence for that case.
  - [med] Add `outcome-refresh-family` eval.
  - Needs source check: the MCP 2026-07-28 claims at `:29,30,60,67` and the OAuth 2.1 draft revision.

### api-rest-design: SLIM (low)
- Value: mostly Generic. Sonnet 5.5 designs and reviews REST APIs to this standard unprompted. The decision parts that survive: `SKILL.md:23` "A Must-change cites a written rule or precedent ... With no rule to cite, the finding is an Improvement"; `:24` consistency is the check; RFC 9745/8594 deprecation header handling in `versioning.md`; the RateLimit-headers draft in `rate-limits.md` (revision 11 per `:63`).
- Evidence: 18 sessions listed, 0 calls, 1 routing eval. The skill is the only api-* skill with real listing exposure, so it has had chances to fire.
- Fixes:
  - [med] SLIM: keep the review procedure (`:19-26`), `errors.md`, `versioning.md`, `rate-limits.md` (about 250 of 540 lines total). Cut the "Design a new surface" bullets (`:28-37`), which restate common practice, and review whether `review-checklist.md` (118 lines) and `reference-gates.md` (32) earn their place. I did not read these references line by line, UNVERIFIED.
  - [low] Add `outcome-problem-details`.
  - Needs source check: RFC 9745 and the RateLimit draft revision.

### api-webhooks: KEEP-FIX (medium)
- Value: K-decision with checkable specifics. Standard Webhooks header names, signing string and `v1,`/`v1a` prefixes (`:39-42`), "10 attempts over about 75 hours" (`:53`), and a disciplined audit list (`:76-87`). A model asked to "add webhooks" invents a header scheme or signs only the body; this skill corrects that.
- Evidence: 0 sessions listed, 1 routing eval.
- Fixes:
  - [med] Receiving third-party webhooks (Stripe, GitHub) is the common task and no plugin covers it; `:8` excludes it. Add a short consumer section here or in app-auth: raw-body verification, constant-time compare, timestamp tolerance, exempt route from CSRF. (The first and third points are already stated for provider docs at `:43`.)
  - [low] Add `outcome-signing`.
  - Needs source check: Standard Webhooks 1.0.0 details and the 75-hour schedule.

### app-auth: KEEP-FIX (medium)
- Value: K-decision. Its edge is the "never weaken to make it pass" posture (`:90`) and a validation list that insists on cross-tenant denial (`:79`), which models skip. Specific non-obvious lines: `:48` response-time equalization on reset, `:64` take the entry the trusted proxy appended, not the leftmost, `:36` PKCE S256 for confidential clients (RFC 9700). The rest is mainstream.
- Evidence: 13 sessions listed, 1 load, 1 call in 1 session. It is one of the few here that actually fired.
- Fixes:
  - [med] Add only the short non-obvious gaps, not a passkey tutorial: SPA token storage (BFF or in-memory, no `localStorage`), passkey RP ID scoping and recovery fallback, NIST 800-63B-4 password rules (length, breached-password check, no composition rules), RFC 9207 `iss` check for multi-issuer clients. About 12 lines in `SKILL.md:41-52`.
  - [low] `:36` add ID-token `aud`/`azp`.
  - [med] Add `trigger-idor` and `outcome-callback` evals (no evals today).
  - Needs source check: NIST SP 800-63B-4 rule set.

### better-auth: KEEP (high)
- Value: K-private (library version facts newer than the model). `:15` ties docs to the installed release line; `:44-52` lists verified gotchas (secondaryStorage precedence, `customSession` caching, `auth.api` skips rate limiting, handler before body parsers, `nextCookies()` last); `:72` the custom rate-limit store must implement atomic `consume`. A model writing Better Auth config from memory gets option names wrong because the API changes per release.
- Evidence: 26 sessions listed, 5 loads, 5 calls in 3 sessions. This is real, repeated use.
- Fixes:
  - [low] Add a trigger eval and a `negative-auth-js`. No evals today.
  - Needs source check: the 1.7.10 subpath claim (`:58`) and the `llms.txt` line list (`:15`) will date quickly.

### threat-model: KEEP-FIX (low)
- Value: K-decision. `:49-53` verify-before-flag ("Kubernetes RBAC is on by default, while Redis has no password by default"), `:55-70` exploitability tiers with rules, and "Never mark a threat as accepted" (`:8`). A bare model produces a STRIDE table of generic threats and flags "no RBAC configured". The skill suppresses that. 277 lines of references (STRIDE element table, attack trees, requirements, template) are the bulk and are partly generic.
- Evidence: 28 sessions listed, 0 calls, no evals. The `security-auditor` agent can load it for whole-system requests (agent text).
- Fixes:
  - [med] Add `outcome-tiers` (k8s manifest plus unauthenticated route: Tier 1 finding with `path:line`, no RBAC flag). Without it there is no evidence the procedure helps.
  - [low] Consider trimming `requirements-and-controls.md` compliance mapping (UNVERIFIED, not read in full).

### privacy-review: DEPRECATE (low confidence)
- Reason code: Generic.
- Value: fails the K-decision test. A bare Sonnet 5.5 asked "where does user PII go in this repo" inventories fields, traces sinks and flags logs and erasure gaps, and says "not legal advice". The skill's one sharp rule is `:18` ("Cite the article ... do not restate its wording from memory ... list them as open questions"), which fits in one line of the owner's CLAUDE.md or a reference of threat-model.
- Evidence: 2 sessions listed, 0 calls, no evals.
- Lost: for Haiku, the field-inventory template (`:24`) and severity ladder (`:29-33`). If kept, fold into threat-model as `references/privacy.md` (about 60 lines) rather than a separate listing. Low confidence because the cost is small either way (125 listing tokens, 2 sessions).

### dependency-vetting: KEEP (high)
- Value: K-decision plus K-private facts. `:14` "Never run the package's code" lists the non-obvious executions (`pip download` of an sdist, `uv add`), `:126` "`pip download` and `pip install --no-deps` still build sdists", `:125` git dependency `.npmrc` git executable swap, `:119-120` npm 12 `allowScripts`, pnpm 11 `minimumReleaseAge`. These are corrections of what models do (they run `npm install` to inspect). GuardDog is pinned (`:78`).
- Evidence: 53 sessions listed, 5 loads, 5 calls in 3 sessions. Used.
- Fixes:
  - [med] Add the `outcome-no-exec` case (tool_used Bash with `input_match` `npm install|pip install|uv add`, max 0). It is a safety invariant with no test.
  - [low] `uvx guarddog@3.2.0` pin (`:78`) and npm 12 / pnpm 11 defaults need source check.

### design-critique: DEPRECATE (medium)
- Reason: Generic and Duplicate (upstream port of Anthropic's `design` plugin skill of the same name).
- Value: a checklist critique of a static mockup (first impression, usability, hierarchy, consistency, accessibility). Sonnet 5.5 does this on a screenshot without help. The one useful boundary (`ui-critic` renders live pages) already lives in the `ui-critic` agent and ui-direction.
- Evidence: 1 session listed, 0 calls, no evals, installed only through design-meta.
- Lost: a stage-matching rule (`:25`) for Haiku. Nothing private.

### design-handoff: DEPRECATE (medium)
- Reason: Generic and Duplicate (upstream port). A handoff spec (layout, tokens, states, edge cases) is something the model writes unprompted. 1 session listed, 0 calls, no evals. Lost: the state-matrix template for Haiku.

### design-system: DEPRECATE (medium)
- Reason: Generic and Duplicate (upstream port). Token and hardcoded-value audit is a grep plus summary the model does without the skill (`:30-45` is the evidence-gathering list). Boundaries with `web-design` need a table (`:11-18`) just to explain which of the two to use, which signals overlap. 1 session listed, 0 calls, no evals. Lost: the `output-templates.md` shapes.

### ux-copy: DEPRECATE (medium)
- Reason: Generic and Duplicate (upstream port). The principles "clear, concise, consistent, useful, human" and the CTA rules ("Save changes" not "Submit") are what every current model writes. `ui-direction/SKILL.md:62` already contains the same CTA and error-message rules for the cases it covers.
- Evidence: 41 sessions listed (design-core), 0 calls. No evals. It costs 108 listing tokens in every web session.
- Lost: nothing a current model needs; Haiku may pick "OK" for dialogs.

### accessibility-review: DEPRECATE (low confidence)
- Reason: Generic. The WCAG 2.2 AA content is accurate (prior review, and `:15` drops 4.1.1 correctly), but any current model knows WCAG 2.2, and `uiux-lookup` ships 119 cited rules including WCAG 2.2 (`uiux-lookup/SKILL.md` domain table). The only corrections over a bare model are 4.1.1 removed and 2.5.8 at 24 px, which Sonnet 5.5 and Opus 5.5 already get right (UNVERIFIED; no eval). The upstream skill still targeting WCAG 2.1 is the only real gap, and it matters only if the official plugin is installed.
- Evidence: 41 sessions listed, 0 calls, no evals.
- Lost: a WCAG 2.2 checklist for Haiku. If kept, add the delta list (4.1.1, 2.4.11, 2.5.7, 2.5.8, 3.3.8) to `uiux-lookup` references and delete this skill.
- Confidence is low because the cost is small; the strongest argument for keeping it is that it is the only text that says "do not cite 4.1.1".

### screen-reader-testing: KEEP-FIX (low)
- Value: K-decision, narrow. `:Who does what` states that Claude cannot hear speech output, the accessibility tree is "never screen-reader evidence", and unavailable human testing must be reported as blocked. That corrects a real failure mode (claiming a pass from an a11y snapshot). Key commands per screen reader live in `references/commands-and-scenarios.md`.
- Evidence: 41 sessions listed (design-core), 0 calls, no evals. Needs a human with NVDA or VoiceOver; the owner's stack (infra, TypeScript, web apps) rarely does manual SR testing.
- Fixes:
  - [med] Remove from `design-core` (keep in `design-meta`, or make `disable-model-invocation: true`). It costs 122 listing tokens in every web session for a workflow the owner has not asked for in four weeks.
  - [low] Add `outcome-blocked` (no human session available: every scenario marked blocked, no claimed speech output).

### ui-direction: KEEP-FIX (medium)
- Value: Tooling plus Measured plus K-decision. Tooling: `scripts/draw.mjs` deals a researched direction from a 1.37 MB library (`library/*.json`), `assets.mjs` fetches credited open-licence imagery. K-decision: step 3 "deal directions from the library instead of inventing one, because a model asked to invent a look picks the category default", the competitor test sentence, and the "defaults" table (`:49-56,89-104`). Measured: 5 of 6 outcome cases score 1.0 with the skill against 0.4 without.
- Honest read on the measurement: the 0.4 baseline equals the two cheap graders passing (`page-exists.md`, `no-lorem.md`) and the weight-3 `judged-page.md` failing. That judge's PASS criteria (`outcome-saas-invoicing/graders/judged-page.md`: no eyebrow labels, no identical icon cards, no gradients, no cream-and-terracotta palette, idea taken from the subject) restate the skill's own tells list. So it proves the skill makes the model follow the skill, not that a blind reviewer prefers the page. It is still the best evidence in the group and the constraints (no invented testimonials, short headlines, one named action) are independently reasonable. A blind pairwise judge with a rubric that does not name the tells would settle it.
- Evidence: 41 sessions listed, 0 loads, 0 calls (the gate to "why never chosen"). The owner's web sessions are TypeScript apps and infra dashboards, not landing pages, so the description (`landing page, marketing site, portfolio ... looks generic, templated or AI-made`) rarely matches the task. The skill is right to stay model-invocable; the cost is 126 tokens. I would not change the description to catch more tasks, because the skill is expensive to run (scripts, a render loop with a `ui-critic` agent).
- Fixes:
  - [low] `SKILL.md:68`: ".section is a type selector, .cta an element selector" is wrong; both are class selectors. Reword the specificity example.
  - [low] `evals/outcome-*/graders/page-exists.md:3` uses `**/index.html` while `judged-page.md:3` and `no-lorem.md:6` read root `index.html`. Use root `index.html` in all three.
  - [med] `outcome-conference-format` scores 0.4 against 0.4: sharpen or delete.
  - [med] Add a rubric-independent outcome (blind pairwise) before treating the lift as established.

### uiux-lookup: KEEP (medium)
- Value: Tooling. A local BM25 search (`scripts/search.mjs`, 20 tests pass) over 119 cited UX rules, 32 app rules, 22 native-stack guideline sets (WPF, WinUI, Avalonia, SwiftUI, Compose and others), 1,934 Google Fonts families with licences, and 105 icons. The fonts and licence metadata and the native-stack rows are facts the model recalls unreliably. The WCAG rows are generic.
- Evidence: 1 session listed (only via design-meta), 0 calls, no evals (a spec exists).
- Fixes:
  - [low] Add `trigger-compose-rule` and `outcome-ran-search` (tool_used Bash with `input_match` `search\.mjs`).
  - [low] Data dated 2026-08-13 (`data/provenance.json`), refresh on a schedule; needs source check for Google Fonts counts.

### web-design: SLIM (low)
- Value: mostly Generic. Hierarchy, responsive and state contracts (`:3-5`) are what a model writes anyway. What is not obvious: the evidence-ledger step for an existing system (`:2`), `references/color-oklch.md` plus `token-core.css`, `design-md-template.md` and `rendered-review-checklist.md` (68 lines).
- Evidence: 41 sessions listed, 1 load, 1 call in 1 session. It is the only design skill that fired. A single call is not enough to separate value from a one-off.
- Fixes:
  - [med] SLIM `SKILL.md` from 109 to about 60 lines: keep steps 1, 2, 6 and the rendered-review pointers; cut the foundations paragraphs in step 4 and the motion timing in step 3.
  - [low] Add `negative-restyle` and an outcome case (extend an existing token set without inventing a new one).

### click-path-audit: KEEP-FIX (low)
- Value: K-decision. The side-effect map and the foreign-reset list (`:21-33`) are a method that finds sequential-undo bugs. A bare model reads each function and declares the handler fine. The trace format is concrete.
- Evidence: 0 sessions listed (not in any meta), 1 routing eval (trigger only).
- Fixes:
  - [med] Add the `outcome-effect-interference` llm case on the existing prompt (name the `useEffect([cart.items])` reset as cause). Without one there is no evidence the method beats plain debugging.

### mcp-server: KEEP-FIX (medium)
- Value: K-private (newer than training and newer than the official plugin). The SDK package names changed with the 2026-07-28 revision (`:12`); `:25` per-SDK factory semantics for stateless HTTP; `:28` the TypeScript handler neither authenticates nor checks `Host`/`Origin`; `:43` Inspector 2.11.0 needs Node 22.19. The official `mcp-server-dev` plugin (`build-mcp-server`, 221 lines) is current to the 2025-11-25 spec by its own `versions.md` (checked 2026-03) and my grep found no `createMcpHandler` or 2026-07-28 text in it. If both are installed they compete; this one is more current.
- Evidence: 11 sessions listed, 0 calls, 3 positive evals, no outcome.
- Fixes:
  - [med] Add `outcome-stateless` (require `@modelcontextprotocol/server`, `registerTool`, `createMcpHandler`, an Origin/Host check; not_contains `@modelcontextprotocol/sdk`). It is the case that would prove the skill beats a model's old-SDK memory.
  - [low] Add `negative-audit-thirdparty`.
  - Needs source check: SDK package names, 2026-07-28 revision, Inspector 2.11.0. Prior review verified them on 2026-10-23; recheck before the next release since the references (`typescript.md`, `python.md`, `go.md`, `rust.md`, 556 lines) record SDK versions.

### mcp-server-audit: KEEP (high)
- Value: Tooling plus K-decision. `scripts/mcp_audit.py` (`scan`, `pin`, `verify`, stdlib, offline, 7 tests pass) reads raw tool descriptions for pseudo-tags, hide-from-user instructions, sensitive paths, invisible Unicode and oversized text, and pins SHA-256 hashes so a rug pull shows as exit 1. The safety rules (`:14-20`: listing runs the server, never add an unaudited server to the session, Snyk Agent Scan uploads descriptions) correct what a model does by default (adds the server and looks).
- Evidence: 0 sessions listed, 1 routing eval. Absence of evidence.
- Fixes:
  - [low] `mcp_audit.py:145` flag duplicate tool names in `scan`, since a dict by name hides shadowing.
  - [low] `mcp_audit.py:178` `os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)` before writing.
  - [med] `SKILL.md:25` remove the unpinned-launcher review that `:10` hands to agent-config-audit.
  - [med] Add `outcome-offline-scan` (scaffold `tools.json` with `<IMPORTANT>`; require `mcp_audit.py scan`).

### mcp-server-review: KEEP-FIX (medium)
- Value: K-decision. Two passes (static security review and one real local protocol session for release QA) with a rule never to send attack payloads to a running server (`:Safety rules`). `references/security.md` carries the RFC 9207 client rule and the OWASP MCP Top 10 mapping. Distinct from audit (your own code versus third-party tool descriptions) and build (`mcp-server`).
- Evidence: 10 sessions listed, 0 calls, 1 trigger eval.
- Fixes:
  - [low] Add `negative-build` and `outcome-no-live-probes`.
  - Consider folding this into `mcp-server` as `references/review.md` if the owner wants fewer MCP listings: both are about a server you own, and `mcp-server/SKILL.md:45` already hands off to it. Not required. Confidence that they should stay separate: medium.
  - Needs source check: OWASP MCP Top 10 URL, 2026-07-28 MUSTs.

### agent-config-audit: KEEP-FIX (medium)
- Value: K-decision plus K-private. Facts newer than the model: `:35` project and local `.claude/settings.json` ignore `bypassPermissions`/`auto` (a Low finding, not Critical), auto mode is the start mode from v2.1.283; `:62` only exit code 2 blocks, so `|| true` or `exit 1` in a guard fails open; `:61` prefer exec-form hooks; `:39` `enableAllProjectMcpServers`. A bare model flags a project-scope `bypassPermissions` as critical.
- Distinct enough from the siblings. `plugin-vetter` vets third-party content before install; this audits active config; `config-audit` prunes bloat. The remaining ambiguity is a cloned repo's `.claude/`: this description says "Use before trusting a cloned repo's .claude/", while plugin-vetter owns "not yet trusted" content. Decide one owner.
- Evidence: 0 sessions listed, 3 routing evals (two nearly identical: `trigger-agent-config-audit-1` and `agent-config-audit-routing`), no outcome.
- Fixes:
  - [med] Add a check for `autoMode.allow` in user or managed settings (overrides `soft_deny`) and note `autoMode` in project settings is ignored. Needs source check against the permissions docs.
  - [med] Pick one owner for a cloned repo's `.claude/`: say "a repo you cloned and are about to trust: this skill; a plugin or marketplace entry to install: plugin-vetter" in both descriptions.
  - [low] Delete one of the two near-identical trigger cases.
  - [med] Add `outcome-findings` (Critical on `Bash(*)`, secret not printed, unpinned `npx -y` flagged).

### agent-instructions: KEEP-FIX (medium)
- Value: K-private plus K-decision. `references/loading.md` and `SKILL.md:12-18` hold load-order facts that a model does not hold with confidence: AGENTS.md is read only when no CLAUDE.md exists in the tree, `@import` is four hops deep, `paths:` rules load on touch, and "all loaded files are concatenated, not overridden". The step that turns a repeated mistake into a check rather than louder prose is a real decision.
- Overlap: official `claude-md-management` (present in `claude-plugins-official`) does the quick pass; this skill says so (`:10`) and scopes itself to restructuring.
- Evidence: 8 sessions listed, 0 loads, 1 trigger eval (no `model:` pin per the prior review; UNVERIFIED now).
- Fixes:
  - [low] `evals/agent-instructions-trigger/graders/not-skill-authoring.md:4-6` is an inert negative; delete or replace with `negative-security`.
  - [med] Add `outcome-under-200` (600-line CLAUDE.md in, root file under 200 lines with `paths:` rules and `@AGENTS.md` handling out).
  - [low] Put the `/doctor prompt-audit` pointer in SKILL.md, not only `loading.md:55`, so a reader of the body sees the quick path. Version claim (v2.1.283) needs source check.

### config-audit: KEEP-FIX (low)
- Value: K-decision. Soft-delete only, one item at a time, `/context` for real costs, `claude plugin details <name>` for projected token cost (`:24`). A bare model would offer to delete in bulk and estimate tokens by guessing. Process-heavy, mostly short (44 lines).
- Overlap: the `tokendoctor` plugin installed on this machine measures the same thing deterministically; UNVERIFIED how much it covers (not in my list). `fewer-permission-prompts` is excluded in the description.
- Evidence: 0 sessions listed, no evals.
- Fixes:
  - [med] Add one outcome case (bulk "remove all" request is declined for per-item confirmation, deletion is soft).
  - [low] Verify `references/channels.md` (linked at `:25`; the dead-link scan passed) still lists current channels.

### file-conversion: DEPRECATE (medium)
- Reason: Generic.
- Value: Sonnet 5.5 converts MP4 to MP3, PNG to JPEG, Markdown to DOCX and CSV to JSON with ffmpeg, ImageMagick, pandoc and Python unprompted. The skill's additions are a verification list (`:42-46`), "never upload to conversion services" (`:8`), and "ImageMagick 6 installs `convert` instead of `magick`" (`:15`). These are good habits, not knowledge a model lacks, and the owner's CLAUDE.md or sandbox is the right place for the no-upload rule.
- Evidence: 0 sessions listed, in no meta, no evals, no scripts.
- Lost: for Haiku, the fresh-output-directory and verify-after-convert discipline. Nothing private.

## Cross-plugin findings

- **Design cluster.** design-core pulls ui-direction, ui-critic, web-design, screen-reader-testing, accessibility-review and ux-copy into every web session (`plugins/design-core/.claude-plugin/plugin.json`). In 41 sessions the six produced 1 call (web-design). Recommended: `design-core` keeps only `ui-direction`, `ui-critic` and `web-design`; the other three go away (ux-copy and accessibility-review deprecate, screen-reader-testing moves to design-meta). Deprecating the five ported skills means editing `design-meta`, `design-core` and `README.md`; run `python3 scripts/plugins.py check` and `catalog` after.
- **Name collision with Anthropic `design`.** Moot if the five deprecate. If any stays, rename it (for example `a11y-audit`), because duplicate names compete wherever claude.ai syncs the official plugin.
- **Rendered-UI review overlap** persists: `ui-critic` (agent), `web-design` rendered-review checklist, `design-critique` (static). With design-critique gone the line is clean: image goes to the model, rendered page goes to `ui-critic`.
- **api-* cluster.** `api-idempotency` and `api-webhooks` each point at the other for the consumer-dedupe case and neither owns receiving webhooks. `api-keys` and `api-oauth-provider` are one decision ("keys or OAuth") split over two skills. app-auth routes to both.
- **Security cluster.** `/security-review` (built-in), `security-auditor` (agent), `security-scan` (scanner scripts), official `claude-security` plugin (agent pipeline), `threat-model` (design level). The boundaries are stated in each description and are coherent. security-scan is the only one with deterministic scanners.
- **Config cluster.** agent-config-audit, config-audit, plugin-vetter, agent-instructions are distinct by job. The remaining ambiguity is only a cloned repo's `.claude/`.
- **MCP cluster.** mcp-server, mcp-server-review and mcp-server-audit do not overlap in task. `mcp-server-audit` step 2 re-reviews launchers that agent-config-audit owns. Official `mcp-server-dev` overlaps `mcp-server` if installed.
- **Eval gap.** Of 30 plugins, only ui-direction has outcome evals, and its judge shares its rubric with the skill. The skills whose value is a procedure (threat-model, app-auth, api-idempotency, mcp-server, dependency-vetting, agent-config-audit) have no outcome case, so none of their claimed value is measured.

## Needs source check

- OWASP Top 10:2025 IDs for XXE (A02), uploads (A06), postMessage and default credentials (A07), `vuln-categories.md:27,35,38,44`.
- MCP 2026-07-28 revision: RFC 9207 SHOULD, CIMD and DCR deprecation, SDK package names, Inspector 2.11.0 and Node 22.19, `api-oauth-provider/SKILL.md:29,30,60,67`, `mcp-server/SKILL.md:12,43`.
- OAuth 2.1 draft revision 16 still a draft; RFC 9700 as BCP 240 (`api-oauth-provider/SKILL.md:8`).
- Standard Webhooks 1.0.0 headers and "10 attempts over about 75 hours" (`api-webhooks/SKILL.md:39-53`).
- IETF idempotency-key draft expired at revision 07; RateLimit headers draft revision 11 (`api-idempotency/SKILL.md:14`, `api-rest-design/SKILL.md:63`).
- Buf STANDARD lint and FILE breaking defaults and the `UNARY_RPC` category (`api-grpc/SKILL.md:39-43,96`).
- Claude Code: auto mode as start mode from v2.1.283, project `defaultMode` ignored for `auto`/`bypassPermissions`, `autoMode.allow` override semantics, `/doctor prompt-audit` (`agent-config-audit/SKILL.md:35`, `agent-instructions/.../loading.md:55`).
- npm 12 `allowScripts`, pnpm 11 `minimumReleaseAge`, GuardDog 3.2.0 sandbox requirement (`dependency-vetting/SKILL.md:78,85,119-120`).
- NIST SP 800-63B-4 rules before adding them to app-auth.
- Whether the official Anthropic `design` plugin is installed in the owner's Claude Code sessions (it is not in the local marketplace cache and not in this session's skill list).
- Better Auth 1.7.10 subpath exports and the `llms.txt` line list (`better-auth/SKILL.md:15,58`).
- Google Fonts counts and dated rows in `uiux-lookup/data/provenance.json`.
