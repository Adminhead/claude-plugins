# consult: accept codex app servers that differ from the README unit

Status: draft, 2026-10-22. Reviewed once (reviewer, opus, 2026-10-23); findings folded in, see Critique log. Not started; see `## Status` at the end.

The problem: `checkServerLocked` (`plugins/consult/hooks/consult/appserver.ts:260-280`) requires the server-wide config to match the README example unit key by key, so any other set of systemd flags gets `not-locked`. The user wants to run the `codex-consult` service with their own flags and still have consult work, without copying the sample unit exactly. Those flags may leave a key unset, or turn web search or plugins on for other codex clients.

## Done when
- consult accepts a server whose server-wide config differs from the README unit, as long as every guarantee consult needs holds **for the consult thread**. It checks each guarantee on the thread itself, or relies on a probed, value- and version-gated override. Otherwise it fails closed with a message that names the one flag it can't do without.
- Every `not-locked` message names the key, why consult needs it, and the flag that fixes it. That includes the `strict` messages, which are reworded but keep the same checks.
- The README splits the unit into **required** flags (class S) and **recommended** flags, and says what changes when a recommended flag is left out.
- An opt-in `codexLockPolicy: "strict"` userConfig keeps today's checks.
- `bun test plugins/consult/tests/*.spec.ts`, `claude plugin test plugins/consult`, `claude plugin validate --strict plugins/consult` and `python3 scripts/plugins.py check` pass.
- Live checks against the user's current unit (S4) give the outcome the S1 decision gate predicts. That is either a pass, or `not-locked` naming exactly the class S flags. The gate rewrites this line with the concrete expectation.
- consult is shipped at 0.3.0.

## Findings (verified 2026-10-22, line refs re-checked 2026-10-23)
- **What failed today:** `consult` returned `not-locked: web_search is null (want "disabled"), features.plugins is missing (want false)`. The user's `~/.config/systemd/user/codex-consult.service` drops `--disable plugins` and `-c 'web_search="disabled"'` from the README unit (`plugins/consult/README.md:53-75`; ExecStart at 63-67), and keeps the rest.
- **Stage 1 (before `thread/start`)** runs `checkServerLocked` on both `config/read {}` and `config/read {cwd, includeLayers}` (`scripts/codex-app-server.ts:342-347`). It requires these server-wide values:
  - `web_search == "disabled"`;
  - `tools.web_search` absent;
  - `sandbox_mode == "read-only"`, `approval_policy == "never"` and `approvals_reviewer == "user"`;
  - every `LOCKED_FEATURES` entry `false` (`plugins, hooks, apps, browser_use, computer_use, multi_agent, image_generation`).
- **consult already overrides all of those per thread.**
  - `threadStartParams` (`appserver.ts:213-235`) sends `web_search: "disabled"`, `features.<f>: false`, `mcp_servers.<n>.enabled: false`, `sandbox: "read-only"`, `approvalPolicy: "never"`, `approvalsReviewer: "user"`, `modelProvider: "openai"` and `ephemeral: true`.
  - `turnStartParams` adds `sandboxPolicy: {type: "readOnly", networkAccess: false}`.
  - Diff mode uses `review/start` with an inline target instead (`appserver.ts:251-253`; `codex-app-server.ts:422-435`).
- **Stage 2 verifies part of that on the thread:**
  - `checkReadOnly` covers sandbox, approval and reviewer;
  - `checkProvider` covers the provider;
  - `checkCwd` covers the cwd;
  - `checkLockdown` covers MCP via `mcpServerStatus/list {threadId}`;
  - `hooks/list` is also read, but by `{cwds: [cwd]}`, not by thread (`codex-app-server.ts:373`), so it is a cwd listing, not a per-thread readback.

  So the server-wide `sandbox_mode`/`approval_policy`/`approvals_reviewer` checks duplicate stage 2.
- **Not verified on the thread today:** `web_search` and every `features` flag. For these, the server-wide check is the only evidence.
- **Override precedence is unknown for enabled values.**
  - sessionFlags (the unit's `-c`/`--enable`) beat the project layer (`docs/plans/consult-codex-app-server.md:137`).
  - The one per-thread override that was probed (MCP, `:139`) ran with those keys already disabled in sessionFlags.
  - Nothing yet shows that `thread/start.config` beats a server that sets `web_search="live"` or `--enable plugins`, either in sessionFlags or in `~/.codex/config.toml`.
- **Option plumbing:**
  - the request types are `ClientRequest`/`ProbeRequest`, validated by `checkClientRequest`/`checkProbeRequest` (`appserver.ts:148-199`);
  - the mod builds the request in `codexRequest` (`hooks/consult/consult.ts:189`);
  - `--probe` is a manual stdin CLI (`README.md:92`) that can't read userConfig, and it prints `locked: true` whatever ran (`codex-app-server.ts:550`).
- **Versions:** installed codex-cli is 0.163.0. `TESTED_CODEX` is 0.162.1 and `MIN_CODEX` is 0.162.0 (`appserver.ts:11-12`). The existing `untested` flag marks only *newer* versions.
- **Options and version:** consult has one userConfig, `codexSocket` (`plugin.json:9-16`), and is at 0.2.0. The project-layer allowlist (`PROJECT_KEYS_ALLOWED`, `appserver.ts:27`) already blocks lock keys in enabled project layers, and this plan doesn't change it.

## Design
Every lock key falls into one of three classes. Which class each key lands in is settled by the S1 probes, not assumed.

| Class | Meaning | Stage 1 (server-wide) | Stage 2 (thread) |
| --- | --- | --- | --- |
| **T: thread-verified** | consult sets it per thread and reads the effective value back for that thread (a `threadId`-scoped call) | not checked | the effective value must match, otherwise the call fails before any turn or review |
| **O: thread-overridden, not observable** | consult sets it per thread. A probe showed codex honours the override on both `turn/start` and `review/start`, against the server value now set, on this codex version, with a passing positive control | the server value must be one the probe covered, and the version must be in `O_VERIFIED_ON` (exact match) | none |
| **S: server-required** | per-thread override not shown to win, ambiguous evidence, or no positive control possible | required, as today | none |

**O is value-gated and version-gated.** For each O key, `LOCK_CLASSES` records the covered pairs of server value and origin, for example `web_search: [(absent, -), ("disabled", sessionFlags), ("live", sessionFlags), ("live", user)]`, and `O_VERIFIED_ON` lists the exact versions. Stage 1 reads the origin from `config/read`'s `origins`. A pair counts as covered only if the probe variant that produced it passed. A pair or version outside those lists makes the key behave as S for that call, and the message says which list missed. This closes the gap where a key earned on "absent" would be trusted on "live".

Expected outcome, to be confirmed by S1:
- `sandbox_mode`, `approval_policy` and `approvals_reviewer` are **T** (stage 2 already reads them off the thread).
- MCP is already **T**.
- `hooks` is **T** only if S1 finds a `threadId`-scoped readback. Otherwise **S**. The cwd-scoped `hooks/list` stays in `checkLockdown` as an extra check, but it doesn't earn T.
- `web_search` is **T** with a thread readback, otherwise **O** if the probes pass with a positive control, otherwise **S**.
- `plugins` is the likely **S**: plugins load at server start, and with none installed the probe has no positive control.
- `apps`, `browser_use`, `computer_use`, `multi_agent` and `image_generation` go to **T**, **O** or **S** per evidence. No positive control means S.
- `tools.web_search` stays **S** (any value fails closed) unless a probe shows the per-thread `web_search: "disabled"` beats it.

**Policy option:** `codexLockPolicy` (userConfig string, `""` / `"thread"` / `"strict"`, default `""` meaning `"thread"`).
- `thread`: the classes above.
- `strict`: every key is S, the same checks as today, with the new per-key messages.

There is no "off" value. Provider, read-only sandbox, MCP and the project-layer allowlist are always enforced.

**Probe output:** the `--probe` line reports `policy` and the class each key resolved to for that call, in place of a bare `locked: true`.

**Unchanged:** project-layer allowlist, provider checks, socket checks, the opt-out marker, `auth` and `too-old`, the diff-mode secret filter.

**Messages:** one key, the guarantee and the fix per failure. Example: `the server enables plugins (features.plugins is missing), and consult cannot disable plugins per thread on codex 0.163.0. Add --disable plugins to the codex-consult unit.`

## Slices
Each slice has the same checks and commit rule.
- **Checks:** `bun test plugins/consult/tests/*.spec.ts`, `claude plugin test plugins/consult`, `claude plugin validate --strict plugins/consult`, `python3 scripts/plugins.py check`.
- **Commit:** stage explicit paths, and commit once a reviewer has passed the slice.

### S1. Probes (coordinator or coder-high; no repo edits beyond the probe log)
Throwaway servers on short `/tmp` sockets, each stopped and its socket removed afterwards. No-turn steps use a scratch `CODEX_HOME`. Turn steps use the signed-in home on a scratch repo containing only `a.txt`, with the lowest-cost model and effort.

**Server variants.** Each key under test is planted in four states:
- (a) absent, as in the user's unit;
- (b) disabled, as in the README unit;
- (c) **enabled in sessionFlags** (`-c 'web_search="live"'`, `--enable plugins`, ...);
- (d) **enabled in the user layer** (a scratch `CODEX_HOME/config.toml`). Turn steps on (d) get sign-in by copying `~/.codex/auth.json` into the scratch home with mode 0600, and delete it when the probe ends. **Never edit the real `~/.codex/config.toml`**: the live `codex-consult` service and the user's other codex clients share it.

1. **Schema:** `codex app-server generate-json-schema` (or the 0.163.0 equivalent). List the methods that give a `threadId`-scoped view of effective config, tools, skills or hooks, with their params.
2. **No-turn readback:** for each variant, `thread/start` with consult's `threadStartParams`, then call every step-1 candidate. Record per key whether the thread reads back as overridden.
   - Plant one hook (`features.hooks` on, a hooks config in the scratch home) and compare `hooks/list {cwds}` with any thread-scoped listing.
3. **Turn behaviour**, only for keys step 2 can't read back. Run it on variants (a), (c) and (d), for both paths: `turn/start` (plan mode) and `review/start` inline (diff mode).
   - **Positive control:** the same server and model, on a thread started *without* consult's override for that key, must show the capability. For web search, a web search item for the prompt `Use web search to find today's date; if you cannot search, say NO-SEARCH.` If the control doesn't show the capability, the key's evidence is ambiguous, so it goes to S.
   - **Consult thread:** no capability item, and for web search the reply says `NO-SEARCH`.
   - **Plugins:** install one harmless test plugin in the scratch home that contributes a skill. The control thread must see it, and the consult thread must not. With no plugin able to be installed, plugins goes to S.
4. Write the results to `docs/research/consult-lock-probes-2026-10-22.md`: per key and variant, for both paths, the control result, the consult-thread result, the readback and the codex version. List the file in `docs/README.md` "Other research".

**Decision gate:** the coordinator assigns T/O/S per key and records it in a `## Decisions` section of this plan, with each O key's covered server values. It also rewrites the Done-when live-check line with the concrete expected outcome for the user's unit, and answers Open question 1 with the user. A key whose evidence is ambiguous, or that is O on `turn/start` but not on `review/start`, goes to S.

### S2. Code (coder-critical; security-relevant fail-closed logic)
Files and symbols:
- `hooks/consult/appserver.ts`:
  - `LOCK_CLASSES`: per key, its class, flag, guarantee text and covered server values;
  - `O_VERIFIED_ON` (exact versions), with `TESTED_CODEX` moved to 0.163.0 **here**;
  - `checkServerRequired(config, policy, version)` replaces `checkServerLocked`: it checks S keys, plus O keys whose value or version gate misses, and every key under `strict`;
  - `checkThreadLocks(...)` for T keys that have a new readback;
  - `ClientRequest`/`ProbeRequest` gain `policy`, and `checkClientRequest`/`checkProbeRequest` accept only `""`, `thread` or `strict` (anything else → `input`);
  - per-key messages, including under `strict`.
- `scripts/codex-app-server.ts`:
  - stage 1 calls `checkServerRequired` on both config views;
  - stage 2 calls `checkThreadLocks` after `thread/start`, before `turn/start` **or** `review/start`;
  - the probe line reports `policy` and per-key classes instead of `locked: true`;
  - the stdin probe request takes a `policy` field.
- `hooks/consult/consult.ts` (`codexRequest`, line 189) and `register.tsx`: read `codexLockPolicy` from userConfig and pass it in the request.
- `.claude-plugin/plugin.json`: the `codexLockPolicy` userConfig.
- Tests (`tests/appserver.test.ts`, `tests/codex-app-server.spec.ts`, `tests/fixtures/fake-app-server.ts`):
  - under `thread`, the user's current unit config gives the decision gate's predicted result;
  - an O key with a server value outside its covered list → `not-locked` naming the value;
  - an O key on a version not in `O_VERIFIED_ON` → `not-locked` naming the version, on both an older version (0.162.1) and a newer one (0.164.0);
  - a T key that reads back enabled → `not-locked`, with neither `turn/start` nor `review/start` sent;
  - an S key missing → `not-locked` naming the key and its flag;
  - `strict` fails every existing spec-4 case, with the regexes updated to the new per-key messages, and `appserver.test.ts:202` changed from `README` to the new text;
  - an invalid policy → `input` from both the client and the probe request;
  - the probe line carries `policy` and the classes;
  - provider, MCP and read-only failures are unchanged under both policies.

  Every other existing test stays green.

Acceptance: the checks, plus `grep -n "example unit" plugins/consult/hooks/consult/appserver.ts plugins/consult/scripts/codex-app-server.ts`, which shows no user-facing message telling the user to copy the unit.
Commit: `feat(consult): check codex locks on the consult thread instead of requiring the example unit`.

### S3. Docs (scribe)
`plugins/consult/README.md`, verified against `LOCK_CLASSES` and the S1 probe file:
- `:13` (requirements: the service, the tested version);
- `:22` ("a server started without the README unit's flags is never used");
- "The codex client" (`:29-41`): the per-thread checks;
- "Run the codex app server" (`:49-75`): required flags (S), recommended flags with the effect of dropping each, and the example unit kept as the recommended setup;
- `:86`, `:92` (`--probe` output and its `policy` field), `:103` and `:106` (strict-unit and 0.162.1 wording);
- `codexLockPolicy` under options.

Also add one line to the Status of `docs/plans/consult-codex-app-server.md` pointing at this plan.
Commit: `docs(consult): required and recommended app server flags`.

### S4. Release and live checks (coordinator)
1. Bump consult 0.2.0 → 0.3.0 in `plugin.json` and the marketplace entry, then run `python3 scripts/plugins.py catalog && python3 scripts/plugins.py check`.
2. Run `ship-plugin consult`. The marketplace installs from GitHub, so it asks before pushing.
3. After `/reload-plugins`, against the user's **unchanged** `codex-consult` unit:
   - the stdin `--probe` with `policy: ""` gives the decision gate's predicted outcome and per-key classes;
   - a plan-mode and a diff-mode `mcp__consult__consult` call each return a reply, or the predicted `not-locked`;
   - the stdin `--probe` with `policy: "strict"` and a call with `codexLockPolicy: "strict"` set via `/config` both return the strict per-key `not-locked`.
4. If the calls pass, run the paperthin plan's skipped cross-model critique (`docs/plans/paperthin-ports.md`, Critique log item 4) as the first real use.

## Rejected alternatives
- **Drop stage 1 and trust the per-thread overrides:** keys without a thread readback would rest on an unchecked override, and the precedence against an *enabled* server value is unknown. Class O keeps that trust explicit, probed with a positive control, and value- and version-gated.
- **A user allowlist of relaxed keys** (`codexAllowServerKeys`): it moves a security decision into free-text config, and could relax a key consult can't enforce per thread.
- **A private codex server per call:** rejected in the original consult plan (the user wants the running, pre-configured service).
- **Just document "use the example unit":** that is today's behaviour, and it is what the user asked to change.

## Risks and rollback
- **A codex update changes override precedence:** T catches it on the thread. O falls back to S on any version outside `O_VERIFIED_ON` (exact match), so a new or older codex costs a `not-locked` and a re-probe, never a silent leak.
- **A detached review thread in diff mode:** O requires the `review/start` probe to pass too. T checks run before `review/start` is sent.
- **Plugins inject tools that no listing shows:** this is why plugins defaults to S without a positive-control probe.
- **Web search is a model-side tool, not sandbox network:** `networkAccess: false` doesn't stop it. The guarantee rests on T or a value-gated O.
- **Rollback:** revert the S2 commit, or set `codexLockPolicy: "strict"`.

## Critique log
Reviewer (opus), thorough pass, 2026-10-23, verdict "changes needed". All findings were adopted:
1. **[blocker]** The probes never planted enabled values, so an O key earned on "absent" would have been trusted on "live". Now there are four server variants, and O is gated on covered server values.
2. **[major]** No positive control. Now a control thread without the override must show the capability, and a missing control means S.
3. **[major]** Diff mode's `review/start` wasn't probed. Now both paths are probed, O must pass both, and T checks run before either.
4. **[major]** The option path was incomplete (request types, validators, `codexRequest`, a probe that can't read userConfig, `locked: true`). The symbols are now listed, with a stdin `policy` field and per-key classes in the probe line.
5. **[minor]** `hooks/list` is cwd-scoped, not thread-scoped. hooks is now T only with evidence.
6. **[minor]** The version gate is now an exact-match `O_VERIFIED_ON`, the bump moved to S2, and older and newer versions are tested.
7. **[minor]** `strict` keeps the checks and rewords the messages, and the tests are updated to match.
8. **[minor]** The Done-when line is now set at the decision gate.
9. **[minor]** S3 now lists every README line it touches.
10. **[minor]** Two line references are corrected.

Re-check by the same reviewer:
- Findings 2-4 are resolved.
- Finding 1 was partly resolved. The value gate didn't record origin, so it now gates on value plus origin.
- One new major was fixed: variant (d) had no sign-in route and risked an edit to the real `~/.codex/config.toml`. It now copies `auth.json` into the scratch home and forbids that edit.
- One minor was fixed: hooks earns T only from a `threadId`-scoped readback.

Cross-model critique was not run, because consult itself is the thing that's broken.

## Decisions
1. **plugins is S (user, 2026-10-23).** `--disable plugins` stays a required flag whatever S1 finds, so S1 doesn't probe plugins. The user's unit must add it, and the S4 live check expects exactly that `not-locked` until it does.
2. **web_search may be enabled on the server (user, 2026-10-23).** Its target class is T, or O. S1 must cover `"cached"` and `"live"`, from both sessionFlags and the user layer, on both `turn/start` and `review/start`, with a positive control. If the probes show the per-thread `web_search: "disabled"` loses to an enabled server value on any path, **stop and report to the user** rather than shipping S for it, because that contradicts this decision. `tools.web_search` follows the same rule.
3. **Default policy:** `thread`, with `strict` opt-in. This is the plan's default and the user didn't flip it.
4. **S1 decision gate (2026-10-23, codex-cli 0.163.0; evidence in `docs/research/consult-lock-probes-2026-10-23.md`):**
   - **T:** `sandbox_mode`, `approval_policy` and `approvals_reviewer` (read back from the `thread/start` response); `hooks`, `apps`, `browser_use`, `computer_use`, `multi_agent` and `image_generation`. The readback is `experimentalFeature/list {threadId}`. It is paged (about 175 entries), so the check pages to the end or fails closed. Each key must read `false` on the consult thread.
   - **O, version `0.163.0` only:**
     - `web_search`. Covered pairs: (absent, -), ("disabled", sessionFlags), ("cached", sessionFlags), ("cached", user), ("live", sessionFlags), ("live", user). Any project-layer origin is uncovered, and so is any other value.
     - `tools.web_search`. Covered: `{context_size: "high"}` from sessionFlags or user. Any other content fails closed.
   - **O depends on T:** the review path searches through `codex_apps/search_service.web_run`, which only `features.apps: false` stops. So the web_search O pairs are trusted only when `apps` reads back `false` on the thread in the same call. If apps fails, web_search fails with it. Absent is not safe without the override (default search is on), so consult keeps sending `web_search: "disabled"` per thread.
   - **S:** `plugins` (Decision 1).
   - **Done-when live check, concrete:** against the user's unchanged unit, `--probe` and both call modes return `not-locked` naming only `features.plugins` and the `--disable plugins` flag. After the user adds `--disable plugins` and restarts the service, the same checks pass, with web search still enabled at the server.
   - **Untested, so fail closed:** project-layer origins for every O key; versions other than 0.163.0; whether `review/start` runs under the thread's sandbox (the existing stage 2 sandbox check is unchanged).

## Open questions
None left.

## Status
- Done (2026-10-23):
  - S1: probes and Decision 4.
  - S2: code in 99f8796, plus fixes in 49b14db after a thorough review (opus). The review found 2 major and 2 minor issues, all fixed, and the re-check passed.
  - S3: docs in 32e6be7.
  - S4: consult 0.3.0 pushed and updated at user scope.
- Live check against the user's unchanged unit, as predicted:
  - with the default policy, `--probe` returns `not-locked` naming only `features.plugins` and `--disable plugins`;
  - with `strict`, it also names `web_search`.
- Left:
  - After the user adds `--disable plugins` to the unit and restarts it: the passing probe, one plan-mode and one diff-mode call, then the paperthin critique (S4 step 4).
  - A separate bug the review found: the agy path's read-only gate allows `view_file` but agy calls `read_file`.
