# Batch tools-b report

## Plugins created

| Name | Type | Description (exactly as plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `termwright` | skill | Drive and test terminal UI apps with the termwright CLI: YAML step files that assert state transitions, one-shot screen and PNG capture, and daemon sessions, with safety rules for real input. | archive/plugins/termwright/skills/termwright (own) | none |
| `esp-idf` | skill | ESP-IDF firmware skill for ESP32-family chips: write, review, debug and bring-up, with build/flash/monitor wrappers, templates, and confirmation gates before flashing, eFuse burns or partition changes. | archive/plugins/coding-esp/skills/firmware-engineer (own), plus its eval | none |
| `file-conversion` | skill | Local-only file conversion skill: image, audio, video, document and CSV/JSON conversions with ffmpeg, ImageMagick, pandoc, LibreOffice and the Python stdlib, inspecting inputs first, preserving originals and verifying outputs. | 3rd-party/wshobson-agents/plugins/file-conversion (MIT, Copyright (c) 2024 Seth Hobson; LICENSE shipped) | none |
| `open-source-release-audit` | agent | A read-only subagent that audits a repo before it goes public: secrets (gitleaks or trufflehog, regex fallback), PII, internal references, dangerous files, .env.example gaps, git history and unreadable binaries, returning PASS, PASS WITH WARNINGS or FAIL. | 3rd-party/ECC/agents/opensource-sanitizer.md + skills/opensource-pipeline (MIT, Copyright (c) 2026 Affaan Mustafa; LICENSE shipped) | none |

## Validation and tests

- `claude plugin validate --strict plugins/<name>`: passes for all four.
- Grep for codegraph, claude-mem, coding-core:, github:, "Efficient ", coding-esp, firmware-engineer, coding-shell, playwright-cli:, Prompt Defense, PROACTIVELY, forker/packager: no hits.
- esp-idf template scripts: `bash -n` and `shellcheck -x` are clean. I reviewed them line by line: no port scanning, PORT is required to flash, and they never run `set-target`.
- open-source-release-audit: I ran the gitleaks command (8.30.1) on a throwaway repo. It found an AWS key that exists only in history, with the value redacted. The step 8 unreadable-file listing works too, and `%q` quoted a hostile filename `logo $(x).png`. Every Bash command in the agent body goes through `readonly-agent-gate` with `extra_agents=open-source-release-audit` (rc=0). That check made me change two things: the gate blocks `IFS=` assignments and `sh -c`, so I dropped `IFS=` and used `grep -rIL` for the non-git fallback.
- No mod or hook-script tests apply. The esp-idf eval moved to `plugins/esp-idf/evals/esp-panic-routing/`, with graders renamed to `esp-idf:esp-idf` and `problem-solving:problem-solving`. I didn't run it (it costs money).

## Version checks

- termwright: crates.io max_version is 0.2.0, the GitHub release is v0.2.0, and the newest commit is still 50fd170, the commit the references pin. The note now says it is still the latest as of 2026-10-17.
- ESP-IDF, from GitHub releases: v6.1 (2026-08-27) is still the newest feature release. The newest patches are v6.0.3 (2026-09-02) and v5.5.6 (2026-10-16). I reworded the triage line to match. The references' "checked against v6.0 docs" notes are unchanged and weren't re-verified against v6.1 docs.
- gitleaks flags: from `--help` on 8.30.1. trufflehog flags (`--no-verification`, `--json`, `--no-update`, `git file://`, `filesystem`): from the upstream README via Context7. trufflehog isn't installed here, so I didn't run it.

## Deviations and decisions

- esp-idf: the skill was renamed from firmware-engineer, and the "Not for" text moved from the description into the body. References, templates, and the eFuse/flash gates are unchanged.
- termwright: only the description was trimmed, the playwright cross-reference updated, and the version note updated.
- file-conversion: the upstream workflow is kept nearly verbatim, with three changes. The five example routes moved to `references/routes.md` to keep SKILL.md lean. I added a "Not for" line and an ImageMagick 6 (`convert`) note.
- open-source-release-audit: these are departures from upstream ECC.
  - The forker and packager stages, the /opensource commands, and the Prompt Defense Baseline are gone.
  - It writes no SANITIZATION_REPORT.md. The final message is the report, and the tools are Read, Grep, Glob, Bash.
  - It audits the real repo, not a staging fork. Scope is tracked files plus `git log --all`. Ignored local files such as `.env` are fine. A dangerous file that was ever committed is CRITICAL.
  - The "history must be a single commit" rule is replaced by a history audit that says which findings a squash would remove and which need key rotation regardless.
  - It runs scanners first. gitleaks gets `--redact --ignore-gitleaks-allow` and an empty `-i` dir, so inline allows and the repo's .gitleaksignore can't hide findings. trufflehog gets `--no-verification` so found keys aren't sent to provider APIs, and its Raw value is cut to 4 characters. Repo-shipped scanner allowlists are reported as warnings.
  - Regex-only coverage downgrades the verdict to at most PASS WITH WARNINGS.
  - Added patterns: Stripe, Slack xox tokens, Google AIza keys, Anthropic/OpenAI keys, ASIA keys, amqp URLs, internal TLDs, Atlassian/Slack workspace URLs, author emails from history, tfstate, .har, and credentialed .npmrc/.pypirc/.netrc.
  - Downgraded to WARNING: `*.map`, tracked node_modules/venv, private IPs that are documented placeholders, and `.local` names. `.claude/settings.json` is CRITICAL only when it holds a credential.
  - The 130-line unreadable-file shell script became a 5-line `git ls-files --eol` loop. It classifies by NUL content, keeps names out of the report, and writes the manifest to `/tmp/open-source-release-audit/unreadable.txt`. I used literal /tmp paths because the gate only allows literal scratch redirect targets.
- The agent is read-only with no Edit or Write tools, so it is a **candidate for `readonly-agent-gate` `extra_agents`** (`open-source-release-audit` or `open-source-release-audit:open-source-release-audit`).

## Unverified / TODO

- The agent hasn't been invoked end-to-end in a real session, and no trigger evals were run for the four plugins.
- The esp-idf references weren't re-verified against v6.1 docs, apart from the console note, which already covers v6.1.
- The trufflehog path is untested locally.

## Suggested follow-ups

- Add trigger evals for file-conversion and termwright, plus one outcome eval for the audit agent on a seeded repo.
- Consider listing `open-source-release-audit` in readonly-agent-gate's docs as an example `extra_agents` entry.
