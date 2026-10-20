# README templates by project type

Pick the skeleton by what the reader is deciding, not by the language. A library reader is judging fit with their codebase. A CLI reader is comparing against a tool they already run. A framework reader is making a multi-year bet. Each list is a starting order. Drop what the project does not need: the median README has about seven sections, and half fall between five and twelve.

Contents: [Library or SDK](#library-or-sdk) · [CLI tool](#cli-tool) · [Application or service](#application-service-or-self-hosted-product) · [Framework](#framework-or-platform) · [Template or starter](#template-starter-or-learning-resource) · [Monorepo root](#monorepo-root) · [Internal service](#internal-team-service) · [Personal project](#personal-or-portfolio-project) · [Config directory](#config-or-dotfiles-directory) · [Minimal](#minimal) · [Section patterns](#section-patterns) · [What belongs elsewhere](#what-belongs-elsewhere)

## Library or SDK

1. Name and one-line description
2. Badge row (four at most)
3. Two to four sentences: the problem, the approach, the shape of the API
4. Why this over the alternatives, on concrete axes only
5. Usage: the smallest complete example, with its output
6. Install, with runtime and version requirements from the manifest
7. Core API: the few entry points, linking to the full reference
8. Status and stability (semver policy, supported versions)
9. Links: docs, examples, support
10. Licence and contributing pointer

Put usage above install. A reader who dislikes the API shape won't care how to install it, and one who likes it will scroll down.

## CLI tool

1. Name and one-line description
2. One real command and its real output, as a text transcript
3. Why this over the tool readers already have
4. Install per platform, package-manager one-liners first
5. Three or four common invocations, each with a comment on what it is for
6. Configuration: only the options most users touch, linking to the rest
7. Status, versioning, upgrade notes
8. Licence and contributing pointer

A recorded terminal GIF is fine as an addition, but never the only place a command appears.

## Application, service, or self-hosted product

1. Name, one-liner, screenshot with alt text
2. What it does and who it is for
3. Why this over the hosted or incumbent option
4. Try it: hosted demo, one-command container run, or sandbox
5. Requirements: runtime, memory, storage, external services
6. Install and first-run configuration
7. Architecture in one paragraph, or one diagram plus a text summary
8. Security and data-handling posture (link `SECURITY.md`)
9. Status, release cadence, upgrade and backup notes
10. Support channels, licence, contributing pointer

## Framework or platform

1. Name and one-liner
2. The mental model in one paragraph: the two or three concepts everything else derives from
3. Why this over the alternatives, including what it deliberately does not do
4. A complete small application, end to end
5. Install or scaffold command
6. Ecosystem and extension points
7. Stability and long-term support commitments
8. Docs, community, governance, licence

## Template, starter, or learning resource

1. Name and one-liner
2. What you will have after using it, stated as an outcome
3. Prerequisites and assumed knowledge
4. Use it: the clone or scaffold command and the first thing to run
5. What is inside: a short directory map
6. What to change first
7. Currency: which versions it tracks and when it was last verified
8. Licence and attribution terms

## Monorepo root

The root README routes readers to the packages and does not cover each one inline.

1. Name and one-liner for the whole repo
2. A table of packages: name (relative link to its README), one line on what it is, published name or badge
3. Which package to start with, for the common entry points
4. Repo-wide development setup, or a link to `CONTRIBUTING.md`
5. Licence (and note any packages licensed differently)

## Internal team service

Written for teammates and new hires, so lead with onboarding and operations rather than adoption.

1. Name and one-liner, owning team and on-call contact
2. Overview: what it does, why it exists, where it sits; upstream and downstream dependencies
3. Local setup: prerequisites with versions, access needed (VPN, secrets store)
4. Environment variables: a table of name, purpose and where to get it, with no values
5. Run locally and run tests (exact commands)
6. Architecture and key files (path and purpose table)
7. Deployment and environments
8. Runbooks and troubleshooting (symptom, cause, fix)
9. Related docs, dashboards, design docs

Skip badges and the licence section unless the org requires them.

## Personal or portfolio project

1. Name and one-liner
2. Screenshot or demo link if it is visual
3. What it does and why you built it
4. Tech stack, with one reason per choice where it is interesting
5. Getting started (clone and run)
6. How it works: the interesting parts
7. What I learned (optional, useful for portfolios)
8. Licence, or "personal project" if not shared for reuse

## Config or dotfiles directory

The audience is future-you, probably confused.

1. Title and a `Last reviewed: YYYY-MM-DD` line
2. One sentence: what this configures and why it is custom
3. What's here: a path and purpose table
4. Why this setup: the goals or workflow it optimises for
5. How to extend: steps for adding the common kinds of things
6. Dependencies and install commands
7. Gotchas: load order, generated files not to edit, surprising behaviour

## Minimal

For a small, single-purpose project, four sections are a complete README. Padding it does not make it look more serious.

1. Name and one-liner
2. Usage example with output
3. Install
4. Licence

## Section patterns

**One-liner.** Name the technology, the job and the medium in one sentence a newcomer can parse. Define or link any unusual term. Draft three on different axes (mechanism, problem removed, thing replaced) and let the user pick.

**Why this.** Use concrete axes: a dependency count, a size, a supported-platform difference, or a design trade-off you chose on purpose. Close with when *not* to use it ("if you need X, use Y instead"). Never disparage alternatives. Leave out any number you cannot source in the repo.

**Status.** Write one honest line, for example "Early beta: A and B are stable; C is not built yet", or "Feature-complete; maintained for security fixes only". Take it from the user and the commit history, never from optimism.

**Install.** Copyable commands, with prerequisites taken from the manifest (engines, `requires-python`, `rust-version`, the `go` directive, `TargetFramework`). Add a verify step ("`tool --version` prints ...") when the output is stable.

**Usage.** Real, runnable code that shows its output or effect. It is better if the snippet also exists as a file under `examples/` so it stays tested.

**Licence.** Name the licence as in `LICENSE` (the SPDX id) and link to the file: `[MIT](LICENSE)`.

## What belongs elsewhere

| Content | Home |
| :- | :- |
| Contribution process, dev setup in depth | `CONTRIBUTING.md` |
| Release history | `CHANGELOG.md` / the repo Releases page |
| Behaviour expectations | `CODE_OF_CONDUCT.md` |
| Vulnerability reporting | `SECURITY.md` |
| Support policy | `SUPPORT.md` |
| Full API reference, tutorials | docs site or `docs/` |
| Table of contents | nothing: keep headings clear instead (no auto-outline is verified on Forgejo, see forgejo-rendering.md) |

Leave a one-line pointer in the README for each item that exists. Link only files that are really there.
