# Rescue review of the nine deprecated plugins

Read status: every file was read in full, with no omissions. The files are `SKILL.md` for tanstack, accessibility-review, privacy-review, research, javascript, web-development, fact-check, design-critique and design-system, plus every file under `references/` (tanstack 1, accessibility-review 1, privacy-review 1, research 4, javascript 1, web-development 3, design-system 1; fact-check and design-critique have none). That is 1,346 lines in total. Live-plugin checks were done by grep over `plugins/` excluding the ten deprecated plugins and `evals`/`results` folders. Nothing was fetched from the web.

## Summary

1. Three rescue items in total, all small: two for `web-design/SKILL.md` and one for `coding/SKILL.md`.
2. Strongest: the removal of WCAG 4.1.1 Parsing (the eval-shaky item; no live plugin states it).
3. Second: the `svh` / `lvh` / `dvh` choice. The live `uiux-lookup` row 20 says "Use dvh" and conflicts with the better rule here.
4. Third and weakest: keep `||` semantics and sparse-array holes when modernising JavaScript. It was 0.63 in both arms, so a skill did not help, and the live home is a poor fit.
5. `api-contract-review.md` needs nothing moved: `api-rest-design` already covers every point in it.
6. Confidence: high that the other items are duplicate or generic (greps done); medium that the three rescues change model output (only #1 is backed by an eval).

## Per plugin

### tanstack
RESCUE: none. Both files deliberately avoid version facts and say to look up the installed version (`SKILL.md:25`, `:84`). The one concrete pattern (`ensureQueryData` in the loader plus `useSuspenseQuery`, `SKILL.md:40`) is well known, has no live holder, and passed the bare-model check on installed major. Not worth a slot.
DUPLICATE: none. GENERIC: state ownership, query-key stability, optimistic rollback, headless-table, virtualization advice, and the `references/packages.md` verify/test lists.

### accessibility-review
RESCUE: 4.1.1 only (see table). `SKILL.md:22` and `references/wcag-22-aa.md:3`.
DUPLICATE:
- 2.5.8 24 px target and the hit-area point (`SKILL.md:39`, `:118`): `web-design/references/interface-polish.md:29`, `web-design/SKILL.md:77`, `uiux-lookup/.../quick-reference.md:28`.
- 2.5.7 dragging: `web-design/SKILL.md:68`.
- 320 px reflow and 200% text: `web-design/SKILL.md:55`.
- 2.4.11 / 2.4.12 / 2.4.13: `uiux-lookup/.../ux-guidelines.csv:101-103`.
- 3.2.6 Consistent Help: `ux-guidelines.csv:106`.
- 3.3.7 Redundant Entry: `ux-guidelines.csv:107`.
- 3.3.8 and the paste rule (`SKILL.md:119`): `ux-guidelines.csv:108`.
GENERIC: the rest of the 55-criterion table, the output template and the severity scale. Skipped on purpose: 1.4.10 "256 px height for horizontal content" (`wcag-22-aa.md:27`), which is true and obscure but low-impact and unevidenced.
Verified: the A/AA counts (31 + 24 = 55) are consistent with 2.1 (30 A, 20 AA), plus 2 A and 4 AA new, minus 4.1.1.

### privacy-review
RESCUE: none. No live plugin covers GDPR, but the content is checklist-level, and the one rule the eval flagged ("do not restate article wording from memory", `SKILL.md:18`) failed in both arms, so rescuing it has no evidence of helping.
DUPLICATE: "never print personal data from fixtures" (`SKILL.md:17`) is passed bare. `sentry-sdk/.../configuration.md:35` has the pseudonymous-id point.
GENERIC: minimization, retention, erasure across stores, PII in URLs and logs, vendors, breach readiness. Closest near-miss: the backups rule (`checklist.md:24`, documented expiry and re-erase on restore), which is a decision rule but one a model usually raises unprompted.

### research
RESCUE: none. GENERIC: source hierarchy, independence, citation audit, fabricated-citation and missing-qualifier patterns (`source-evaluation.md:46-54`), synthesis labels, depth tiers, technology-evaluation axes. Shared-origin detection passed bare.

### javascript
RESCUE: one weak item (see table). `SKILL.md:23-24`.
DUPLICATE: `--cpu-prof` is at `observability-instrumentation/.../profiling.md:9`.
GENERIC: runtime-first orientation (`engines`/`.nvmrc` passed bare), ESM hoisting, async ownership, `AbortSignal`, `{ cause }`, test hygiene, the performance tool table. `performance.md:17` names `bun:jsc` heap snapshots and `Bun.nanoseconds()`, which I could not verify (see flags).

### web-development
RESCUE: viewport units only (see table).
`api-contract-review.md` (10 lines) is a six-bullet checklist: operation (method, route, headers, success shape matches what the browser reads), failures (400/422, 401, 403, 404, 409, 5xx, stable user-safe), pagination only when the workload needs it, repeated requests (safe methods do not mutate, idempotency key or unique constraint, disabled button is not idempotence), compatibility (keep documented fields, deliberate breaking change needs migration), security (authorize resource and action, CSRF/origin/rate controls). `api-rest-design` needs none of it:
- Status codes and 422: `references/errors.md:14`, `:60`.
- Pagination, including "do not paginate a small bounded result by habit": `references/review-checklist.md:64`, `:115`.
- Safe/idempotent method table: `review-checklist.md:18-29`; keys: `:105` and `SKILL.md:36`.
- Compatibility and breaking changes: `SKILL.md:39-43`, `references/contract-first.md:22`, `references/versioning.md`.
- Security controls: `review-checklist.md`.
The only unique sentence is "a disabled button on the client is not idempotence" (`api-contract-review.md:8`), which is generic. Live skills no longer point at the file (the grep hit only plans and research notes).
DUPLICATE: WCAG 3.3.7 (`SKILL.md:51`, covered by `ux-guidelines.csv:107`). Core Web Vitals good thresholds and TTFB 0.8 s (`SKILL.md:81`): `web-perf-auditor/agents/web-perf-auditor.md:41`, `:47`. `container-type` and the CQ syntax in `responsive-css.md:11-23`: no live holder, but it is standard and generic. 24 px targets and the `overflow-x: hidden` point (`responsive-css.md:57,59`) passed bare.
GENERIC: forms, server boundary, responses, diagnostics, `browser-diagnostics.md` (all 18 lines), `clamp()`, `auto-fit`/`min(16rem,100%)`, logical properties, `min-width: 0`.

### fact-check
RESCUE: none. GENERIC: whole file (extract claims, verdict per claim, memory cannot confirm). The "check the absurd one and the obvious one" idea (`SKILL.md:19`) is a good habit but not a fact.

### design-critique
RESCUE: none. GENERIC: whole file. Unreadable-Figma refusal (`SKILL.md:18`) passed bare.

### design-system
RESCUE: none. DUPLICATE or passed: semantic over primitive tokens (`SKILL.md:66`), extend a variant before adding (`SKILL.md:62`). GENERIC: audit method, templates, the focus-colour-only versus 1.4.11 gotcha (`SKILL.md:67`; covered by `web-design` focus requirements and `ux-guidelines.csv`).

## Claims flagged as wrong, stale or unverifiable

- `responsive-css.md:5` "container queries are widely available since February 2023": February 2023 is when they became Baseline newly available. "Widely available" is a later Baseline stage (about 30 months on), so the wording is imprecise. The `svh`/`lvh`/`dvh` versions (Chrome 108, Firefox 101, Safari 15.4) look right but were not checked.
- `performance.md:17` "heap snapshots via `bun:jsc`" is unverified. Do not copy.
- `performance.md:18` `deno bench`, and the Core Web Vitals numbers (`web-development/SKILL.md:81`): believed correct (INP replaced FID in 2024), but the skill itself says to confirm at source. Live copy already exists, so no action.
- `wcag-22-aa.md:85` 2.4.13 wording is a paraphrase of the W3C text. Do not rescue the wording.
- `checklist.md:26,36` GDPR article numbers (12(3), 19, 28(3), 44-49) are unverified from memory, and the skill itself says not to restate them. Do not rescue.
- Live-side conflict: `uiux-lookup/.../ux-guidelines.csv:21` says "Use dvh" for 100vh. `responsive-css.md:42-44` says `svh` is the safe default. The csv is generated data with provenance, so do not hand-edit it; fix it at the source if at all.

## Rescue table

| # | Fact | Source | Proposed home | Text to add |
|---|------|--------|---------------|-------------|
| 1 | WCAG 2.2 removed 4.1.1 Parsing; do not cite it, and report markup defects under 1.3.1 or 4.1.2. Bare Sonnet cited it in 1 of 3 runs; no live plugin states it. | `accessibility-review/SKILL.md:22`; `references/wcag-22-aa.md:3` | `web-design/SKILL.md` section 5, directly after the "Target WCAG 2.2 AA" bullet (line 69). The topic fits: the section already names criteria by number. | "WCAG 2.2 removed 4.1.1 Parsing. Never cite it; file markup defects under 1.3.1 or 4.1.2." |
| 2 | Full-height mobile section: `min-height: 100svh` is the safe default; `100vh` is the large viewport and runs under the toolbar; `dvh` follows the toolbar, so it can shift layout and updates are throttled; use it only for pinned bottom sheets. The live csv says "use dvh". | `web-development/references/responsive-css.md:42-44` | `web-design/SKILL.md` section 5, after the reflow bullet (line 55). Confirm the file still carries no `dvh` guidance before adding (grep found none). | "For a full-screen mobile section use `min-height: 100svh`. `100vh` runs under the browser toolbar; `dvh` tracks the toolbar, so it shifts layout and updates throttled. Use `dvh` only for pinned bottom sheets." |
| 3 | Keep `||` versus `??` semantics (`||` also replaces `0`, `''`, `false`) and sparse-array holes when modernising JavaScript. Eval 0.63 in both arms, so adding it may not move the score. | `javascript/SKILL.md:23-24` | `coding/SKILL.md`, in the behavior-preserving refactor bullet in step 1. `typescript` disclaims JS runtime semantics, so `coding` is the only fit. Low priority; skip if the skill must stay short. | "In JavaScript, rewriting `||` to `??` or `for` to `forEach` or `map` changes behaviour on `0`, `''`, `false` and sparse-array holes, so keep the original form unless the contract allows it." |
