# skills-to-plugins — spec and plan

Status: Slices 0–5 done, 2026-10-01. Slice 6 not started. All decisions are closed.

## Progress (resume here)

### Slice 0 — done

- **Changed (committed in `5c73e24`):**
  - `plugins/secret-stash/hooks/detectors/openredaction.ts` (`tightened`, `looksLikeSecret`, `isAwsSecret`)
  - `plugins/secret-stash/tests/openredaction.test.ts`
  - The "Prose guard" row in `docs/plans/secret-stash.md`
  - Two bullets under "openredaction patterns" in `docs/plugins/secret-stash.md`
- **Cause:**
  - The vendored `GENERIC_SECRET` pattern allows whitespace as the separator, so it captured the next word of prose after "secret" or "password".
  - `literalDetector` (`hooks/detect.ts`) then matched that vault value everywhere by substring.
  - The `AWS_SECRET_KEY` pattern matched 40-character path text.
- **Fix:** keyword patterns now need a digit, a symbol, or 20 or more mixed-case letters. AWS keys need all three character classes and a key word earlier on the same line. The vendored bundle is untouched.
- **Checked:** `claude plugin test plugins/secret-stash` gives 290 pass and 0 fail, and `validate --strict` passes. A corpus replay cut `GENERIC_SECRET` hits from 24 to 7, all of them real-looking test values.
- **Not yet done:**
  1. The first `review` said not ready to ship. A fix round landed on 2026-10-01: `scan.ts` now passes the value offset to validators, and the suite is at 295 pass, 0 fail. The re-review said ship, with two remaining false-positive classes, and a third fix round was started for them. (1) A `:` separator skipped the prose check, so error text like `secret: <word> denied` stashed the word. The fix treats only `=` as an assignment. (2) The AWS 2-of-3 rule accepted git SHA-1s and 40-character slices of longer runs (package-lock integrity hashes, long paths). The fix requires a run boundary using the `at` offset and rejects `^[0-9a-f]{40}$`. Round three landed: 298 pass, 0 fail, and `validate --strict` passes. Redacting `git log -50` and six package-lock files stashes nothing. The final `quick-review` passed. It suggested a positive test for `aws_secret_access_key=KEY`, which was added. The review loop is closed. Next: steps 2–5. Accepted gap: a lowercase letters-only bearer token after whitespace is missed. The original findings:
     - **Major.** `isAwsSecret` requires the key word on the same line, before the value. That drops real keys the old code caught, and no other detector backs them up. The cases are the AWS console CSV (header row, then the AKID and key), YAML or INI with the value on the next line, and a key word after the value (`<KEY>  # aws secret key`). Fix by accepting a key word anywhere in the validator's ±50-character context, across lines, while still rejecting the chezmoi-path case. Replace the test `aws is nice\n<KEY>` → `[]`, which locks in the regression.
     - **Major.** The docs say "a digit or a symbol", but `-`, `_` and `.` don't count. `--password=<hyphenated passphrase>` now leaks with no backup. Apply `looksLikeSecret` only when the separator is whitespace, because `=` and `:` are assignments, not prose. Correct both docs.
     - **Minor.** AWS keys need all three character classes, so about 1 in 900 real keys has no digit and is rejected. Require two of the three.
     - **Minor.** The call-syntax check rejects real passwords that contain `x()`. Limit it to the whitespace-separator (prose) case.
     - **Minor.** `context.indexOf(value)` can find an earlier copy of the value. Fixing the first item removes the need for it.
     - **Minor.** Prose words with a digit or symbol are still stashed (e.g. `utf8mb4` after "password"). Accepted; state it in the docs.
  2. Done. Version bumped to 0.2.0 in `plugin.json` and the marketplace entry.
  3. Done. Installed 0.2.0 at user scope.
  4. Done, 2026-10-01. Reading `~/.claude/skills/` and `claude plugin list` shows no IDs. A focused live smoke ran through the recording proxy with Haiku 4.5, covering the scenarios the detection change touches: `cat .env` and Read of `.env` (0 hits), `echo <ID> > file` (the file got the real value), a subagent reading a 40-character AWS key next to a chezmoi `references/` path (key redacted, path intact, 0 hits), and prose with "password", "secret", "references", and "management" (intact). `/compact`, `/clear`, resume, and WebFetch were not rerun, since that path is unchanged.
  5. Done. The Slice 0 fix and the user docs are committed on their own. Unrelated work stays uncommitted (`plugins/ripgrep/`, `docs/plugins/ripgrep.md`, the `ripgrep` marketplace entry, the root `README.md`, this plan).
- **Follow-up, out of scope:**
  - The `.env` key rule redacts `undefined` in TypeScript annotations such as `key: undefined`. The rule works as designed, but the noise makes this plugin's own source hard to read.
  - A prompt like `My password is <value>` leaks the value. The vendored `GENERIC_SECRET` pattern takes `is` as the value, and the prose guard then rejects it. 0.1.0 has the same gap (checked against HEAD), so this is not a regression. `password <value>`, `password: <value>`, and `password=<value>` are caught.

### Slice 1 — done, 2026-10-01

- **`${CLAUDE_SKILL_DIR}` resolves in plugin skills**, in the body, in `!` blocks, and in `allowed-tools`. A `Bash(${CLAUDE_SKILL_DIR}/x.sh:*)` grant ran the script without a prompt, and the same command without the skill was denied. `${CLAUDE_PLUGIN_ROOT}` also resolves in skill bodies. Use `${CLAUDE_SKILL_DIR}` for a skill's own scripts and `${CLAUDE_PLUGIN_ROOT}/skills/<sibling>/…` for a sibling's.
- **No shadowing.** A user-level `spikeskill` and a plugin `spikeplug:spikeskill` both load, because plugin skills are always prefixed. Cutover must move the old dir out, or both copies stay in the skill list.
- **`avoid-ai-writing`** 3.36.0 is installed from `conorbronsdon-skills`, and `avoid-ai-writing:avoid-ai-writing` loads. The user-level copy and `commands/clean-ai-writing.md` moved to `~/.claude/skills.migrated/` (the command under `_commands/`). `agents/scribe.md` now preloads `avoid-ai-writing:avoid-ai-writing`. A spawned subagent quoted the skill's H1, so agent `skills:` accepts plugin-qualified names.
- **Installed-plugin check re-run.** No new duplicates. The only short-name match is `design:design-system`, already known.

### Slices 2–5 — done, 2026-10-01

- **Built.** 12 plugins, one commit each, every one reviewed (`review` for `quality`, `quick-review` for the rest). Each plugin landed with its marketplace entry, so Slice 2 had no separate scaffold commit. Worktree isolation failed for every coder agent, so the coders wrote disjoint `plugins/<p>/` dirs in the main checkout.
- **Plan changes, by user decision.** `actions`, `dependabot`, and `pr-comments` moved from `git` to a new `github` plugin. The `screen-reader-testing` plugin became `accessibility`, the home for future accessibility skills. The directory move for `accessibility` landed inside the `quality` commit (`c89b041`) by mistake, and `51ea0a5` finishes it. The user chose a follow-up commit over a rewrite.
- **Review fixes.** `quality`'s manual-only descriptions now say `/quality:test`, `/quality:test-harness`, and `/quality:audit`. `sentry`'s `crons.md` keeps the bare `sentry-cli`, since it means the binary there.
- **`dependencies`.** `quality` declares `["efficient"]`. Bare names resolve against the plugin's own marketplace (plugins-reference docs).
- **Installed.** All 12 are installed at user scope, and a fresh session lists all 40 skills. The scripts in the cache keep their exec bits.
- **Script runs.** `/quality:test`, `authoring:adr-writing` (dry run), and `authoring:create-skill`'s validator all ran from the plugin paths with no permission denials. `${CLAUDE_SKILL_DIR}` resolves to the marketplace source dir, not the cache, for this directory marketplace. Not run: `github:pr-comments` (needs a real PR) and `quality:second-opinion` (sends content to OpenAI or Google).
- **Cutover.** The 40 old dirs moved to `~/.claude/skills.migrated/`. The five agent files were backed up to `skills.migrated/_agents/`, then updated to `efficient:coding`, `efficient:planning`, `efficient:problem-solving`, and `quality:second-opinion`. A fresh session shows no bare leftovers, and a spawned `architect` quoted the H1s of both of its preloaded plugin skills. `~/.claude/skills` now holds only the out-of-scope design skills.
- **Triggering.** "Write an ADR…" loaded `authoring:adr-writing` on its own. "Commit my work." committed without loading any skill. That is the `git:commit` vs `commit-commands:commit` boundary Slice 6's evals cover.
- **Not in scope but noticed.** `ripgrep@adminhead` is not installed. The `quality:second-opinion` grant lets `consult.sh --input FILE` send any readable file to an external model without a prompt. That behavior predates the migration (the old path was already allowed in `~/.claude/settings.json`), but every new install now gets it.

### Next

Slice 6 (evals and docs). Delete `~/.claude/skills.migrated/` only after Slice 6, when the user agrees.

## Goal

Move the user-level skills in `~/.claude/skills/` into plugins in the `adminhead` marketplace, so they install, update, and version like any other plugin. Fix what breaks when a skill leaves `~/.claude/skills/`, and tune each one for Claude Code where there is a concrete gain.

## Non-goals

- `voidrot/agents` stays untouched. It is no longer the source for this work.
- No new skills. Enhancements stay inside existing skill scope.
- No context hooks by default. `ripgrep` earns its `prompt.context` block because nearly every session searches. No skill here has a reason that broad.
- Turning model-invoked skills into manual-only commands. Auto-triggering is the point of most of them.
- `learned/` and `synced/` in `~/.claude/skills/`. They hold no `SKILL.md`.

## Inventory

49 skills. Sizes and script counts are from `du -L` and `find`.

| Kind | Skills |
| --- | --- |
| Plain guidance, no scripts | 19 `efficient-*`, `problem-solving`, `git-commit`, `git-worktree`, `github-actions`, `github-dependabot`, `manage-agent-instructions`, `anti-slop`, `devenv`, `chezmoi`, `pass-cli`, `sentry`, `playwright-cli`, `termwright`, `screen-reader-testing` |
| Scripts, already use `${CLAUDE_SKILL_DIR}` | `audit`, `test`, `pr-comments` |
| Scripts, hardcoded paths | `test-harness`, `adr-writing`, `create-skill`, `second-opinion` |
| Vendored third-party | `avoid-ai-writing` (12M, MIT, upstream `conorbronsdon/avoid-ai-writing`), `ui-ux-pro-max` (3.6M, no license file), the ClaudeKit set `design`, `design-system`, `brand`, `banner-design`, `slides` (frontmatter `author: claudekit`, `license: MIT`), `ui-styling` (`LICENSE.txt` Apache-2.0, frontmatter says MIT). All out of scope (see Decisions) |

## Decisions

| Topic | Decision |
| --- | --- |
| Source | `~/.claude/skills/<name>/`, copied as-is. These copies already carry the Claude Code tuning (e.g. `git-worktree` routes to `EnterWorktree`, seven `sentry-*` merged into one `sentry`) |
| Skill names | Drop a prefix the plugin name already gives: `efficient-react` becomes `efficient:react`, `git-commit` becomes `git:commit`. Single-skill plugins keep the house `ripgrep:ripgrep` form. Confirmed by the user |
| Cross-references | Every mention of another skill uses its full `plugin:skill` name. A reference outside the plugin says "if installed" unless a `dependencies` entry guarantees it. Skills that stay in `~/.claude/skills/` keep their bare names |
| Plugin dependencies | Only for hard runtime needs. `quality` depends on `efficient` (`test-harness` follows `efficient:testing`) |
| Script paths | `${CLAUDE_SKILL_DIR}` for a skill's own scripts, `${CLAUDE_PLUGIN_ROOT}/skills/<sibling>/…` for a sibling's (Slice 1 confirmed both resolve). No `~/.claude/skills` or `/home/buck` path survives |
| Script permissions | Each script a skill runs gets an `allowed-tools` entry on its plugin path, as `test` and `audit` already do. Removes permission prompts for `adr-writing`, `create-skill`, `second-opinion` |
| Overlaps kept | `git:commit` vs `commit-commands:commit`, `authoring:create-skill` vs `skill-creator`, `authoring:manage-agent-instructions` vs `claude-md-management`. Their descriptions already separate scope. Evals confirm the boundary (Slice 6) |
| Vendored design skills | Out of scope by user decision. The ClaudeKit set (`design`, `design-system`, `brand`, `banner-design`, `slides`, `ui-styling`) and `ui-ux-pro-max` stay in `~/.claude/skills/`. No license or upstream work |
| Already a plugin | Never rebuild a skill that ships as a plugin. See "Installed-plugin check" |
| `avoid-ai-writing` | Out of scope. Upstream `conorbronsdon/avoid-ai-writing` publishes it as a plugin. Install it from there and delete the user-level copy. No adminhead entry |
| Cutover | Per plugin: install, verify, then move the old dir to `~/.claude/skills.migrated/<name>/`. Delete the backups only after every plugin is done. `~/.claude/skills` is not chezmoi-managed, so nothing re-creates them |

## Installed-plugin check

Checked 2026-10-01 against `claude plugin list` and every `skills/<name>/SKILL.md` under `~/.claude/plugins/`.

| Skill | Found in | Verdict |
| --- | --- | --- |
| `avoid-ai-writing` | Upstream plugin. Stale cache at `plugins/cache/conorbronsdon-skills/avoid-ai-writing/3.36.0`, not installed, marketplace not registered | Do not rebuild. Install upstream |
| `design-system` | `design@synced` ships `design:design-system`, a different and narrower skill | Not a duplicate. Ours stays user-level (out of scope) |
| `sentry` | `sentry-cli@claude-plugins-official` covers the CLI and API, not SDK setup | Not a duplicate. Cross-reference only |
| `git-commit`, `create-skill`, `manage-agent-instructions` | Overlap in scope with `commit-commands`, `skill-creator`, `claude-md-management` | Different skills. Kept (see Decisions) |
| `audit` | Built-in `/security-review` reviews the branch diff by reading it | Different. `audit` runs scanners (gitleaks, semgrep, trivy, govulncheck, pip-audit) and verifies their findings. Kept; its description should name `/security-review` as the model-only alternative |
| All others | No match | Package |

`ecc` and `hivemind` cache dirs are not installed plugins. Re-run this check before Slice 2 in case anything was installed since.

## Plugin map

12 plugins, all local.

| Plugin | Skills (new name ← old) | Notes |
| --- | --- | --- |
| `efficient` | `coding`, `planning`, `testing`, `e2e-testing`, `problem-solving`, `research`, `auth`, `web-development`, `web-design`, `react`, `tanstack`, `javascript`, `typescript`, `python`, `python-packaging`, `fastapi`, `database-design`, `postgres`, `golang`, `rust` ← `efficient-*`, `problem-solving` | One plugin (confirmed). These skills cite each other densely, and a three-way split leaves 14 cross-plugin edges |
| `git` | `commit`, `worktree` ← `git-*` | Needs `git` |
| `github` | `actions`, `dependabot`, `pr-comments` ← `github-*`, `pr-comments` | Needs `gh`, `jq` |
| `quality` | `test`, `test-harness`, `audit`, `second-opinion`, `anti-slop` | `test-harness` calls `test`'s runner, so they share a plugin. `audit` needs gitleaks, semgrep, trivy, govulncheck, pip-audit (missing ones report "not scanned"). `second-opinion` needs `codex` or `agy` |
| `authoring` | `adr-writing`, `create-skill`, `manage-agent-instructions` | Python 3 for the first two |
| `devenv` | `devenv` | |
| `chezmoi` | `chezmoi` | Refers to `pass-cli:pass-cli` for `protonPass` templates |
| `pass-cli` | `pass-cli` | Refers to `chezmoi:chezmoi` |
| `sentry` | `sentry` | Refers to `sentry-cli:sentry-cli` (external) |
| `playwright-cli` | `playwright-cli` | |
| `termwright` | `termwright` | Pinned to termwright 0.2.0 in the text |
| `accessibility` | `screen-reader-testing` | Home for accessibility skills |

Cross-plugin references that remain, all soft:

- `efficient:*` → `playwright-cli`, `claude-in-chrome`, `accessibility:screen-reader-testing`, `ui-styling`/`ui-ux-pro-max` (user-level), `design:accessibility-review`, `exa:*`, `github:actions`
- `quality:*` → `efficient:testing`, `efficient:problem-solving`, `efficient:auth`, `avoid-ai-writing:avoid-ai-writing` (upstream), `playwright-cli`
- `accessibility:screen-reader-testing` → `efficient:web-development`, `efficient:react`, `efficient:web-design`
- `playwright-cli` → `pass-cli`, `efficient:e2e-testing`

## Per-skill fixes

| Skill | Fix |
| --- | --- |
| `test-harness` | `allowed-tools` and body call `/home/buck/.claude/skills/test/scripts/run_tests.py` (`SKILL.md:8`, `:50`). Point at the sibling skill's script inside the plugin. `SKILL.md:25` reads `efficient-testing/SKILL.md` by path. Replace with "load `efficient:testing`" |
| `github:pr-comments` | `SKILL.md:48` names `~/.claude/skills/test/…`. Replace with "`quality:test` if installed" |
| `adr-writing` | Script path at `SKILL.md:10`, `:21`, `:28`. Add `allowed-tools` |
| `create-skill` | Script paths at `SKILL.md:17`, `:28`. `SKILL.md:14` and `references/specification.md:9`, `:53` teach `~/.claude/skills` as the place to create skills. Add plugin skills (`plugins/<p>/skills/<n>/`, `${CLAUDE_PLUGIN_ROOT}`) as a third location |
| `second-opinion` | `consult.sh` path at `SKILL.md:39`, `:45` |

## Claude Code enhancements

Only where a concrete gain exists.

- **Plugin-path `allowed-tools`** for every bundled script (see Decisions). This is the largest day-to-day gain.
- **Qualified names in "Not for" clauses**, so routing between neighbours (`efficient:testing` vs `efficient:e2e-testing`, `playwright-cli` vs `claude-in-chrome`) uses names the model sees in its skill list.
- **Evals** with `claude plugin eval` in `plugins/<p>/evals/<case>/` for the boundaries most likely to misroute. Start with `git:commit` vs `commit-commands:commit`, `authoring:create-skill` vs `skill-creator`, `efficient:testing` vs `efficient:e2e-testing`, and `efficient:coding` vs `efficient:problem-solving`. Two to four cases per plugin, graded with `tool_used`.
- **`/skill-doctor`** a week after cutover to list never-invoked skills. Candidates to prune or merge.

## Plan

### Slice 0 — fix `secret-stash` false positives (blocks the rest)

Status: done, see Progress.

While the plugin is on, agents in this repo can't trust what they read, and this migration is mostly reading and copying text.

Evidence from this session (2026-10-01), as seen in tool output:

- The word "references" became a `GENERIC_SECRET` ID everywhere: prose, a directory name, and the word "backreferences" in `docs/plans/secret-stash.md`. Every occurrence got the same ID, which points at one bad vault entry spread by the literal-match rule.
- The word "management" (in `claude-md-management`, from `claude plugin list`) became a different `GENERIC_SECRET` ID.
- A plain phrase at `~/.claude/skills/efficient-auth/SKILL.md:30` became a `GENERIC_SECRET` ID.
- A path segment under `~/.claude/skills/chezmoi/` was matched as `AWS_SECRET_KEY`.
- A review agent reported these IDs as defects in the skills. The files on disk were clean.

Steps:

1. Reproduce with a test that feeds each of these strings through the outbound redaction, both alone and after the vault already holds the bad value.
2. Find which source stashed each value: openredaction pattern, `.env` key rule, or a registered value. Then find why the literal-match rule spreads it.
3. Fix the root cause in the detector that misfires. Don't add an allowlist of words.
4. Add regression tests for every string above. Run the full suite, `claude plugin validate --strict plugins/secret-stash`, and the live smoke from `docs/plans/secret-stash.md`.
5. Update `docs/plugins/secret-stash.md` if detection rules change. Review with `review`, since this is security code.

Done when a session can read `~/.claude/skills/` and `claude plugin list` without any IDs in tool output, and the existing secret tests still pass.

### Slice 1 — spikes and gates (blocks the rest)

1. Build a throwaway plugin with one skill that runs `${CLAUDE_SKILL_DIR}/x.sh` from both the body (`!` block) and `allowed-tools`. Load it with `--plugin-dir`. The docs agent says the variable does not resolve in plugins (UNCONFIRMED). The result picks the path form.
2. Install that plugin while `~/.claude/skills/<same name>` exists. Record whether both appear in the skill list. Precedence is UNCONFIRMED in the docs. If both load, cutover must move the old dir before testing the new one.
3. Install `avoid-ai-writing` from upstream (`claude plugin marketplace add conorbronsdon/avoid-ai-writing`, then `claude plugin install avoid-ai-writing@conorbronsdon-skills`, per its `README.md:142-143`). Confirm `avoid-ai-writing:avoid-ai-writing` loads, then move the user-level copy out. `~/.claude/commands/clean-ai-writing.md` reads `~/.claude/skills/avoid-ai-writing/SKILL.md`. Delete the command, since the plugin skill is invocable as `/avoid-ai-writing:avoid-ai-writing`.

### Slice 2 — scaffold

- Create the 12 local plugin dirs with `plugin.json` (version `0.1.0`, author as in `ripgrep`).
- Add 12 marketplace entries. Validate the marketplace with `--strict`.

### Slice 3 — plain-guidance plugins

`efficient`, `git`, `github`, `devenv`, `chezmoi`, `pass-cli`, `sentry`, `playwright-cli`, `termwright`, `accessibility`.

- Copy, rename skill dirs and `name:` fields, rewrite cross-references to qualified names.
- `validate --strict` each plugin.

### Slice 4 — script plugins

`quality`, `authoring`, `github:pr-comments`.

- Apply the path and `allowed-tools` fixes above.
- Run each script once from the installed plugin (`test` on this repo, `adr-writing` dry run in a temp repo, `create-skill` validate on a plugin skill, `second-opinion` against a tiny diff, `github:pr-comments` against a real PR).

### Slice 5 — cutover

Per plugin: install from the local marketplace, run `claude plugin details`, start a session and check the skill list, then move the old dir to `~/.claude/skills.migrated/`. Run one prompt that should trigger a representative skill.

### Slice 6 — evals and docs

- Add the eval cases above, then run `claude plugin eval` per plugin.
- `docs/plugins/<name>.md` per plugin in the `ripgrep.md` shape: what it adds, requirements, install, verify, limits. Update the root `README.md` plugin list.

## Workflow

Slices 3 and 4 split into one coder task per plugin, each in its own worktree. One reviewer pass per plugin diff, with `review` for `quality` (audit and script permissions) and `quick-review` for the rest. A workflow run could fan this out. Running it needs your opt-in.

## Open risks

- **`secret-stash` over-redacts ordinary words** (fixed in Slice 0). In this session it replaced the word "references" and phrases in `efficient-auth/SKILL.md:30` with `__SS_GENERIC_SECRET_…` IDs in tool output. One review agent then reported the IDs as defects in the skills. An agent that copies a skill through a Read/Write round trip relies on restoration being exact. Until it ships, copy with `cp`, never by rewriting file contents. After it ships, still grep every plugin for `__SS_` before commit.
- **Name shadowing** during cutover (Slice 1, step 2).
- **Renamed skills break existing references.** Dropping the prefix changes every invocation (`/efficient-coding` becomes `/efficient:coding`). Known edits, from a scan of `~/.claude/agents/`, `~/.claude/CLAUDE.md`, and `~/.claude/commands/`:

  | File | Old names |
  | --- | --- |
  | `agents/architect.md` | `efficient-planning`, `second-opinion` (3) |
  | `agents/review.md` | `second-opinion` (3) |
  | `agents/quick-review.md` | `second-opinion` (2) |
  | `agents/coder.md` | `efficient-coding` |
  | `agents/coder-max.md` | `efficient-coding`, `problem-solving` |
  | `agents/scribe.md` | `avoid-ai-writing` |
  | `commands/clean-ai-writing.md` | path to `avoid-ai-writing` (Slice 1) |

  Update these in Slice 5, in the same step that moves the old dirs.
