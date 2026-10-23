# G8 review: API, auth, security, design/UX, MCP, agent config

Scope: 26 plugins. Read-only. Checks run: `claude plugin validate` passes for all 26; `python3 scripts/plugins.py check` prints `ok`; `uiux-lookup` `bun test` 20/20 pass; `mcp-server-audit` unittest 7/7 pass; `security-scan` tests import `pytest`, which isn't installed, so they did not run. I checked these facts against live sources and found them correct: MCP 2026-07-28 (stateless core, `Mcp-Method`/`Mcp-Name`, RFC 9207 `iss`, CIMD over a deprecated DCR), npm 12 default-deny `allowScripts`, WCAG 2.2 A/AA count (31+24=55, 4.1.1 removed), RFC 9700/9745, Claude Code `defaultMode` handling in project settings, and the `@import` depth of four hops.

## Summary

- **Eval coverage is the main gap.** 14 of the 26 plugins have no evals at all: accessibility-review, api-graphql, api-grpc, app-auth, design-critique, design-handoff, design-system, screen-reader-testing, uiux-lookup, ux-copy, security-scan, threat-model, privacy-review and dependency-vetting. Nine more have exactly one case: api-idempotency, api-keys, api-oauth-provider, api-rest-design, api-webhooks, mcp-server-audit, mcp-server-review, agent-instructions and click-path-audit. Only `ui-direction` has outcome evals or real hard negatives.
- **[high] Every "not-neighbour" hard negative in this group always passes, so it tests nothing.** `claude plugin eval` loads only the plugin under test (`.claude/skills/skill-evals/references/cli.md:132`: "only the plugin loaded … no other plugins"). These graders forbid a skill from a different plugin, which can never fire, so they pass every run:
  - `api-keys` and `api-oauth-provider` forbid `app-auth`.
  - `api-rest-design` forbids `web-development`.
  - `api-idempotency` and `api-webhooks` forbid each other.
  - `mcp-server` forbids `mcp-server-review`.
  - `mcp-server-audit` forbids `mcp-server`.
  - `agent-config-audit` forbids `config-audit`.
  - `agent-instructions` forbids `skill-authoring`.
  - `click-path-audit` forbids `react`.

  The house pattern copied from `archive/plugins/api` worked only because both skills were in one plugin. Real negatives need a near-miss prompt that asserts the plugin's own skill does not fire.
- **[high] `security-scan` runs code from the branch it audits.** `pip-audit -r requirements*.txt` runs without `--no-deps --disable-pip` (`skills/security-scan/scripts/scanners.py:269-272`), so pip resolves and builds sdists. A requirements file can also carry `--index-url`/`-e git+…` options. The skill only says "mention it" (`SKILL.md:63`) for a tool meant for auditing branches. The uv path at line 267 does use `--no-deps --disable-pip`.
- **[med] `app-auth` has no passkey/WebAuthn, password-policy or OAuth-client mix-up guidance.** It does not cover NIST SP 800-63B-4 password rules (length, breached-password check, no composition rules) or RFC 9207 `iss` validation for clients. It also has no BFF/token-storage guidance for SPAs. `mcp-server-review/references/security.md:91` already holds the RFC 9207 client rule. `better-auth` is the only plugin in the repo that mentions passkeys.
- **[med] Wrong OWASP Top 10:2025 IDs in `security-scan/references/vuln-categories.md`.**
  - XXE is tagged [A05] (line 29); 2025 maps CWE-611 to A02 Security Misconfiguration.
  - File uploads are tagged [A05] (line 40); CWE-434 is A06 Insecure Design.
  - `postMessage` origin (CWE-346) and hard-coded default credentials (CWE-798) sit under A07 in 2025, not A01/A02 (lines 37, 46).
- **[med] Name collision with Anthropic's official `design` plugin.** `accessibility-review`, `design-critique`, `design-handoff`, `design-system` and `ux-copy` keep the upstream skill names and trigger phrases. Both sets were visible in this very session as `design:*`. If both are installed they compete, and the upstream `accessibility-review` still targets WCAG 2.1.
- **[med] Three plugins review the same `.mcp.json` entries:** `agent-config-audit`, `mcp-server-audit` (step 2 still reviews unpinned `npx`/`uvx` even though it defers that check to agent-config-audit) and the `plugin-vetter` agent. A cloned repo's `.claude/` is claimed by both `agent-config-audit` ("before trusting a cloned repo's .claude/") and `plugin-vetter` ("third-party … before it is installed or trusted").
- **[med] Sibling plugins send users to a skill the model cannot run.** `security-scan` is `disable-model-invocation: true`, but `threat-model/SKILL.md:10` names it as a skill to hand off to. Those plugins should tell the user to run `/security-scan:security-scan`.
- **[low] Attribution is present for every ported plugin.** Each has a LICENSE, and Apache ports also have a NOTICE. Two small gaps:
  - `threat-model/SKILL.md` has no in-body attribution line, unlike its siblings.
  - `api-grpc/LICENSE.hdr` is an empty file committed to git.

## Per-plugin findings

### accessibility-review
- The WCAG 2.2 content is accurate: the 55-criterion table matches, 2.5.8 is correctly given as 24px versus the AAA 44px, and 4.1.1 is correctly dropped.
- [low] Its severity scale (Critical/Major/Minor) differs from `design-critique` (Critical/Moderate/Minor).
- [med] `uiux-lookup` also claims "WCAG 2.2" rules. Add a boundary line in both: a single-rule lookup goes to uiux-lookup, an audit goes here.

Evals now: none.

Suggested evals:
- `trigger-checkout-a11y` (routing positive): "Before handoff, check this checkout mockup (checkout.png) for contrast, target sizes and focus visibility against WCAG 2.2 AA."
- `negative-sr-announce` (hard negative, own skill must not fire): "NVDA reads our combobox as 'edit text' with no options. Write me a test script to run with NVDA and Firefox." This belongs to screen-reader-testing.
- `negative-single-rule` (hard negative): "What's the minimum touch target on Android?" This is a one-liner.
- `outcome-wcag22-targets` (outcome, regex plus llm): seed a spec with 20px icon buttons and a sticky footer. Regex for `2\.5\.8` and `2\.4\.11`. Use not_contains for `4\.1\.1` and for "44x44 … AA".

### api-graphql
- Content is sound.
- [low] The pagination section omits a security note that `first`/`last` must both be clamped and that `last` without `before` is expensive.

Evals now: none.

Suggested evals:
- `trigger-public-schema-review` (positive): paste SDL with `orders: [Order]` and `updateOrder(input: OrderInput)`, then ask "we're opening this to partners, review it".
- `negative-gqlgen-resolver` (hard negative): "Fix this N+1 in my gqlgen resolver for `Order.items`." This is server code.
- `outcome-result-unions` (llm): ask for a `createOrder` mutation design. PASS requires a union or interface result with business errors and `[T!]!` lists.

### api-grpc
- [low] `LICENSE.hdr` is an empty file committed to git; delete it.
- Content is accurate. I checked the AIP-194 note that UNAVAILABLE is the only default-retryable code, the rule that response headers commit an RPC, and the buf defaults.

Evals now: none.

Suggested evals:
- `trigger-proto-diff` (positive): give a diff that renumbers field 3 and renames `user_id`, and ask "safe to roll out?"
- `negative-go-interceptor` (hard negative): "Add an auth interceptor to my grpc-go server."
- `outcome-tag-reuse` (regex): require a `Breaking` verdict and the word `reserved` in the answer.

### api-idempotency
- No correctness issues found.
- [low] The description does not mention webhook consumers deduplicating events. `api-webhooks` sends that case here ("consumer-side deduplication (`api-idempotency`)", `api-webhooks/SKILL.md:8`), but this skill's own text says it is not for webhook delivery retries. Settle which plugin owns consumer-side deduplication of received webhooks.

Evals now: 1 routing case; its negative grader always passes.

Suggested evals:
- `negative-webhook-signing` (own-skill-must-not-fire): "Design HMAC signing and secret rotation for the webhooks we send."
- `outcome-atomic-claim` (llm): "review this handler", seeded with a check-then-insert claim. PASS requires flagging the race and proposing a unique constraint in the same transaction.

### api-keys
- [low] Line 39 prescribes a constant-time hash compare after an indexed prefix lookup. It should also mention that an HMAC with a server-side pepper is an option for stored-hash dumps; this is optional.
- Boundary with app-auth: app-auth's description includes "bearer validation, protected endpoints", which can attract "validate incoming API keys on our routes". Add "API keys you issue go to api-keys" to app-auth.

Evals now: 1 case, with an always-passing negative.

Suggested evals:
- `negative-consume-vendor-key` (hard negative): "Where should I store our Stripe secret key in this Next.js app?"
- `outcome-key-format` (regex): require `sha-?256`, a prefix with an environment, and rotation with two keys valid at once. Use not_contains for `bcrypt|argon2` as the key hash.

### api-oauth-provider
- [low] Line 21 lists `device_authorization` as core with no caveat. Add the RFC 8628 §5.4 remote-phishing note and say to enable it only for headless clients.
- [low] Line 23 allows a `plain` PKCE fallback. For MCP authorization servers, the MCP spec requires S256, so say so.

Evals now: 1 case, with an always-passing negative.

Suggested evals:
- `negative-login-callback` (hard negative): "Our Google login callback fails with invalid_grant after deploy." This belongs to app-auth's territory.
- `outcome-refresh-family` (llm): ask for a refresh-rotation design. PASS requires family revocation, a grace window returning the same successor, and no tokens in the query string.

### api-rest-design
- No issues found.

Evals now: 1 case, with an always-passing negative.

Suggested evals:
- `negative-graphql-schema` (own must-not-fire): give GraphQL SDL and ask for a review.
- `outcome-problem-details` (regex): require `application/problem\+json` or `RFC 9457`, and `Retry-After` for 429.

### api-webhooks
- [med] Receiving and verifying third-party webhooks (Stripe, GitHub) is excluded here (line 8) and appears in no other group skill. That is the far more common user task, so the gap is real. Decide an owner, perhaps app-auth or a short consumer section here.

Evals now: 1 case, with an always-passing negative.

Suggested evals:
- `negative-consume-stripe` (hard negative): "Verify Stripe webhook signatures in our Express route."
- `outcome-signing` (regex): `webhook-id`, `webhook-timestamp` and `v1,`. Use not_contains for `exactly-once`.

### app-auth
- [med] It is missing:
  - passkeys/WebAuthn (registration, user verification, RP ID scoping, fallback and recovery);
  - password rules per NIST SP 800-63B-4;
  - MFA enrollment/recovery-code handling;
  - RFC 9207 `iss` validation and per-issuer state for clients using more than one authorization server;
  - SPA token storage (BFF or in-memory, no `localStorage`).
- [low] Line 36 requires `nonce` for OIDC but says nothing about ID-token `aud`/`azp` checks. Line 37 covers only JWT access tokens.
- It is the most-cited neighbour in the group: api-keys, api-oauth-provider, security-scan, privacy-review and threat-model all route to it. Despite that, it has no evals.

Evals now: none.

Suggested evals:
- `trigger-idor` (positive): "GET /invoices/:id returns other tenants' invoices if you change the id; fix it."
- `trigger-reset-flow` (positive, casual register): password-reset review.
- `negative-build-as` (hard negative, own must-not-fire): "Build our OAuth authorization server for third-party apps."
- `negative-better-auth-cli`: "Run the Better Auth CLI migrate for the organization plugin."
- `outcome-callback` (llm): seed a callback that skips the `state` check. PASS requires a state check, S256 PKCE and exact redirect matching.

### design-critique
- [low] The quick accessibility pass (line 36, "small targets") gives no number. Cite 24×24 CSS px (2.5.8) for consistency with accessibility-review.

Evals now: none.

Suggested evals:
- `trigger-mockup` (positive): "Here's onboarding-v3.png from Figma, what do you think?"
- `negative-rendered-page` (own must-not-fire): "Review how localhost:3000/pricing looks at mobile width." This belongs to the ui-critic agent.
- `negative-microcopy`: "What should the delete button say?"

### design-handoff
- No issues found.

Evals now: none.

Suggested evals:
- `trigger-handoff` (positive): "Settings screen is signed off, write the spec for engineering."
- `negative-component-docs` (hard negative, belongs to design-system): "Document all Button variants for our system site."
- `outcome-states` (regex): require focus, disabled, error, empty and loading rows plus `Open questions`.

### design-system
- No issues found.

Evals now: none.

Suggested evals:
- `trigger-audit-tokens` (positive): "grep our src for hardcoded hex colors and tell me how consistent our tokens are".
- `negative-restyle-screen` (hard negative, belongs to web-design): "Make the billing page match our design system."

### screen-reader-testing
- Content is good and correctly says Claude cannot hear speech.

Evals now: none.

Suggested evals:
- `trigger-nvda-script` (positive): "Our modal doesn't announce its title in JAWS; give me exact steps to test it."
- `negative-design-audit` (own must-not-fire): "Check this mockup's contrast against WCAG."
- `outcome-blocked` (llm): with no human-operated session available, PASS requires every scenario to be marked blocked or offered as a script, with no claimed speech output.

### ui-direction
- [low] `SKILL.md:70` calls `.section` a "type selector" and `.cta` an "element selector". Both are class selectors, so the specificity example is wrong.
- [low] In the outcome evals, `page-exists` uses `'**/index.html'` but `judged-page` and `no-lorem` target root `index.html` (for example `evals/outcome-saas-invoicing/graders/judged-page.md:3`, `no-lorem.md:6`). A page written to a subfolder passes the existence grader and fails or skips the content graders.
- `evals-2026-10-17.md:13`: `outcome-conference-format` scores 0.4 in both arms, which means it does not discriminate. Sharpen the rubric or drop it.

Evals now: 13 cases (3 positives, 4 own-skill negatives, 6 outcomes). This is the model suite for the group.

Suggested evals:
- `negative-extend-existing` already covers web-design.
- Add `negative-uiux-rule`: "minimum touch target on iOS?".

### uiux-lookup
- [low] It overlaps accessibility-review on WCAG 2.2 (see that section).
- Stack rows are dated 2026-08-13 and the skill already warns about versions.

Evals now: none. A spec exists (`tests/search.spec.mjs`).

Suggested evals:
- `trigger-compose-rule` (positive): "In Jetpack Compose, how should I size touch targets for icon buttons?"
- `negative-pick-palette` (own must-not-fire, belongs to ui-direction): "Pick a palette and fonts for our bakery site."
- `outcome-ran-search` (`tool_used` Bash with `input_match` `search\.mjs`).

### ux-copy
- No issues found.

Evals now: none.

Suggested evals:
- `trigger-error-message` (positive): "rewrite 'Error 402: payment failed' for our checkout".
- `negative-landing-headline` (own must-not-fire): "write the hero headline and sections for our launch page".
- `outcome-confirm-dialog` (regex): not_contains `\bOK\b|Are you sure`.

### security-scan
- [high] It runs code from the audited branch through pip-audit (see Summary, `scripts/scanners.py:269-272`). Fix it one of three ways: always export or resolve with `--no-deps --disable-pip`, refuse requirement files containing option lines, or ask the user first.
- [med] OWASP 2025 IDs in `references/vuln-categories.md` are wrong: line 29 should be A02, line 40 A06, and lines 37 and 46 A07.
- [low] `SKILL.md:62` says to rerun the tests with pytest, but the README and environment don't provide it. Note the dependency, or port the tests to unittest as mcp-server-audit did.

Evals now: none. Routing evals don't apply (`disable-model-invocation`).

Suggested evals:
- `outcome-not-scanned` (scaffold with a git repo and a planted fake AWS key, run with `--allow-tools Bash`): regex `Not scanned:`, plus not_contains on the full fake key value. This checks that secrets are never displayed.

### threat-model
- [low] No in-body attribution line, although the LICENSE credits wshobson/agents.
- [med] Line 10 routes to `security-scan`, which the model cannot invoke. Say "tell the user to run `/security-scan:security-scan`".

Evals now: none.

Suggested evals:
- `trigger-stride` (positive): "We're adding a public upload API and a worker; threat model it."
- `negative-diff-review` (own must-not-fire): "Security-review my last commit."
- `outcome-tiers` (llm): seed a k8s manifest plus an unauthenticated route. PASS requires a Tier 1 finding with `path:line` and no flag on RBAC-by-default.

### privacy-review
- No issues found.
- [low] `sentry-sdk` exists. `claude-md-management`, which agent-instructions cites, is not in the repo; it is fine only because the text says "if installed".

Evals now: none.

Suggested evals:
- `trigger-pii-map` (positive): "Before our EU launch, where does user email and IP end up in this repo?"
- `negative-authz-bug` (hard negative): "users can read others' profiles via /api/users/:id".
- `outcome-no-legal-advice` (llm): PASS requires legal basis and retention to be listed as open questions.

### dependency-vetting
- Content is current: npm 12 `allowScripts`, pnpm 11 `minimumReleaseAge`, and the GuardDog sandbox requirement.

Evals now: none.

Suggested evals:
- `trigger-unfamiliar-pkg` (positive): "Is `reqeusts-toolbelt2==0.3.1` safe to add?"
- `negative-cve-triage` (hard negative): "Dependabot flagged lodash CVE, what do I do?"
- `outcome-no-exec` (`tool_used` Bash with `input_match` `npm install|pip install|uv add`, min 0 max 0).

### mcp-server
- Content is current for the 2026-07-28 SDKs.

Evals now: 3 positives; one negative grader always passes.

Suggested evals:
- `negative-audit-thirdparty` (own must-not-fire): the mcp-server-audit prompt.
- `negative-wire-plugin`: "add this server to my plugin's .mcp.json".
- `outcome-stateless` (llm): ask for a TS server skeleton. PASS requires `@modelcontextprotocol/server`, `registerTool`, `createMcpHandler` and an Origin/Host check. Use regex not_contains `@modelcontextprotocol/sdk`.

### mcp-server-audit
- [low] `pin_tools` builds a dict keyed by tool name (`scripts/mcp_audit.py:145`). Duplicate tool names, which are themselves a shadowing signal, collapse silently. Flag them in `scan`.
- [low] `pin --out mcp-pins/<server>.json` (`SKILL.md:38`) fails if the directory doesn't exist (line 178). Create the parent directory, or say to create it.
- [med] Step 2 re-reviews unpinned launchers, which it says agent-config-audit owns.

Evals now: 1 positive.

Suggested evals:
- `negative-own-config-perms` (own must-not-fire): "Is `Bash(*)` in my settings.json a problem?"
- `outcome-offline-scan` (scaffold `tools.json` with a `<IMPORTANT>` description): `tool_used` Bash with `input_match` `mcp_audit\.py scan`, plus not_contains of an `npx … inspector` run without consent.

### mcp-server-review
- Content is current, and the RFC 9207 client rules are correct.

Evals now: 1 positive.

Suggested evals:
- `negative-build` (own must-not-fire): "Scaffold a Python MCP server with two tools."
- `outcome-no-live-probes` (llm or `tool_used` Bash max 0): the report must describe tests rather than run curl against a URL.

### agent-config-audit
- [med] Auto mode is now the default start mode (docs: v2.1.283), and its classifier reads CLAUDE.md. The skill has no check for `autoMode.allow` entries in user or managed settings, which override `soft_deny`. It could also note that `autoMode` in project settings is ignored.
- [med] Its scope overlaps `plugin-vetter` on cloned-repo `.claude/` (see Summary).

Evals now: 3 positives, two of them nearly identical (`agent-config-audit-routing` and `trigger-agent-config-audit-2`). The `not-config-audit` grader always passes.

Suggested evals:
- `negative-bloat` (own must-not-fire): "My setup has 80 skills and feels slow, what should I remove?"
- `negative-fewer-prompts`: "I keep getting asked to approve `git status`."
- `outcome-findings` (regex on trigger-1's pasted config): `Bash\(\*\)` Critical, `hunter2` must not be printed (not_contains), and `npx -y some-db-mcp` flagged as unpinned.

### agent-instructions
- [med] It does not mention the built-in `/doctor prompt-audit`, which finds stale or conflicting instruction files. It should either use that command or name it as the quick path.
- [low] Its eval prompt has no `model:` pin.
- The `not-skill-authoring` grader always passes.

Evals now: 1 positive.

Suggested evals:
- `negative-security` (own must-not-fire): "Does this cloned repo's CLAUDE.md contain injected instructions?"
- `outcome-under-200` (scaffold a 600-line CLAUDE.md): regex on the file for line count is not possible, so use an llm rubric. PASS requires a root file under 200 lines, `paths:` rules and `@AGENTS.md` handling.

### click-path-audit
- Content is fine.
- The `not-react` grader always passes.

Evals now: 1 positive.

Suggested evals:
- `negative-build-component` (own must-not-fire): "Add a coupon input component to checkout."
- `outcome-effect-interference` (llm on the existing prompt): PASS requires naming the `useEffect([cart.items])` reset as the cause, with the pattern name.

## Cross-group notes

- **Systemic eval bug, likely repo-wide:** any `not-<other-plugin>` grader always passes in isolation. Grep the repo for `arm: both` graders whose `input_match` names a skill outside their plugin. Either convert them to own-skill near-miss negatives, or check boundaries with a combined run via a meta plugin; `design-meta`/`design-core` could host cross-plugin boundary suites.
- **Committed `runs: 1`:** all 14 routing cases in this group outside ui-direction commit `runs: 1`. The skill-evals checklist says not to commit that.
- **Overlap clusters to fix in descriptions:**
  - Rendered-UI review: `ui-critic` agent vs `web-design` ("reviews rendered UI against it") vs `design-critique`.
  - `.mcp.json` review: agent-config-audit vs mcp-server-audit vs plugin-vetter.
  - Code security: security-auditor agent vs threat-model vs built-in `/security-review` vs gh-code-security. These are fine except for the security-scan routing noted above.
  - Auth: app-auth vs better-auth. This is designed well, since app-auth defers library specifics.
- **External collision:** Anthropic's official `design` plugin uses the same five skill names as the ported design plugins. Rename them, for example `a11y-audit`, or document "don't co-install".
