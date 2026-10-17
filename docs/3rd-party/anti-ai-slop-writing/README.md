# anti-ai-slop-writing

Source: https://github.com/jalaalrd/anti-ai-slop-writing · License: MIT (per README; no LICENSE file in repo) · Last commit: 2026-04-19 · Catalog: [catalog.md](catalog.md)

## Purpose

A single Claude Code skill that constrains a model's writing so the output avoids vocabulary, sentence patterns and punctuation that readers and detectors flag as AI-generated. It is a writing directive, not a plugin: no hooks, agents or commands.

## Layout

```
3rd-party/anti-ai-slop-writing/        (local copy, gitignored)
├── README.md
├── .gitignore                         (.DS_Store only)
└── skills/anti-ai-slop-writing/
    ├── SKILL.md                       (rules, self-check; 122 lines)
    └── references/banned-words.md     (banned lists; loaded before writing)
```

## Counts

- Skills: 1 (per catalog.md; 0 plugins, agents, commands or hooks)
- Files: 4 in the repo, 2 of them the skill
- SKILL.md: 122 lines, about 1,120 words, 36 bold-labelled rules, 11 self-check items
- banned-words.md: about 50 vocabulary entries, 36 banned phrases, 16 banned sentence openers, first-word tells for 5 models, and era-specific vocabulary lists

## Install / use

```bash
/plugin marketplace add jalaalrd/founder-toolkit
```

```bash
cp -r skills/anti-ai-slop-writing ~/.claude/skills/
```

Other tools (Cursor, Codex, Gemini CLI and similar): copy `SKILL.md` into the tool's skills directory. Any chat: paste the contents of `SKILL.md` at the start of the conversation.

Invoke with `/anti-ai-slop-writing`, or ask for a draft "and make it sound human".

## What the skill does

- Loads `references/banned-words.md` before writing and replaces any listed word or phrase with a concrete alternative.
- Breaks AI structure: no rule of three, no run of same-length sentences, no chains of short declaratives (parataxis), no hedging seesaw, no "As [role], I..." openers.
- Caps punctuation: one em dash per 500 words, one exclamation mark per 1,000, ellipses at most once per piece; favours semicolons and colons that pay off.
- Bans formatting leaks: markdown headers in casual or social text, bold for emphasis, emoji bullets, "Thread:" openers, hashtag stacks, markdown in plain-text email or DMs.
- Asks for specifics: real numbers, named things, contractions, time and place, friction or doubt.
- Forbids invented data, statistics, quotes and anecdotes; hypotheticals must be marked "imagine" or "suppose".
- Calibrates voice to the person and platform, with a default of direct and slightly informal.
- Ends with an 11-point self-check that must be applied silently and never mentioned.

## Compared to humanizer

Both skills target the same tells: stock vocabulary, em-dash overuse, chatbot residue, rule-of-three lists, passive voice, decorative bold and headings, and invented specifics. The difference is the job. anti-ai-slop-writing is a generation constraint: it bans about 100 words and phrases, sets numeric caps, and tells the model to write within those limits. humanizer (3.1.0, vendored at `3rd-party/humanizer/`) is an editing procedure: 26 numbered patterns, each with before and after examples, a rule to keep every supported fact, a voice-sample override, file and embedded modes, and a "when not to act" section. Where anti-ai says "replace the word", humanizer says "rewrite the sentence and keep the claim". humanizer also ships a LICENSE file and its own license metadata, which this repo lacks. Use humanizer for editing existing drafts and anti-ai-slop-writing for drafting from scratch.

## Quality notes

- The README's marketplace command points at `jalaalrd/founder-toolkit`, not this repo, so the install route is unverified. The `cp -r` route is the one that matches this repo.
- MIT is stated only in the README; there is no LICENSE file and no copyright line.
- The research claims (Carnegie Mellon 2025, a Buffer 52M-post analysis, Wikipedia) are cited in prose only and were not checked.
- The word lists are mechanical and partly context-dependent ("landscape (figurative)", "robust outside engineering"). The first-word and era lists are dated (2023 to 2025) and will go stale.
- Some rules conflict with plain documentation. "Never mention them" and "never say as per the guidelines" would hide the rules from a reader who needs to know why text is worded a certain way. The em-dash cap also differs from humanizer's stricter zero-dash rule.
- The skill is style-only. Its accuracy section forbids invention but does not check facts.

## Relevance to adminhead

- Catalog-only for now: nothing in `plugins/` depends on it, and it is not installed by the marketplace.
- Useful as a drafting reference for prose that people will read, such as plans, READMEs and announcements, but its "never mention the rules" line should not be copied into project docs.
- Its banned-words file could seed a simple grep check for plugin docs if the team wants one. Expect false positives on context-dependent entries.
- Since humanizer covers the same ground as an edit pass, pick one per workflow to avoid two competing style rule sets.
