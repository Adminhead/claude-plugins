# Batch gamedev-4: gamedev-core part 2

## Plugins created

| Name | Type | Description (plugin.json) | Sources | Deps |
|---|---|---|---|---|
| game-design | skill | Game design documents and decisions: pitch, pillars, core loop, mechanic specs, progression, economy and balancing (curves, sinks and faucets, loot tables, simulation), difficulty and scope cuts. Engine-neutral templates and checklists. | New writing; loot and balancing patterns from awesome-gamedev-agent-skills @ 0a70cfc (procedural-gen, roguelike, rpg, tower-defense), Apache-2.0. Cites Schell, Fullerton, MDA, Adams and Dormans, Schreiber and Romero, Sid Meier GDC 2012, Rogers. | none |
| game-ui | skill | Engine-neutral game UI and UX: HUDs, menus and overlays, a screen stack, resolution and aspect scaling, safe areas, gamepad focus navigation, event-driven HUDs, settings screens, and a game accessibility checklist. | awesome-gamedev-agent-skills @ 0a70cfc `disciplines/game-ui-ux` (Apache-2.0); new `accessibility.md` paraphrased from the Game Accessibility Guidelines, 78 per-guideline links, all checked as returning HTTP 200. | none |
| game-audio | skill | Engine-neutral game audio practice: bus and mixer layout, gain in dB, ducking, adaptive music with layers and quantised transitions, SFX variation and voice limits, beat sync, and platform loudness targets. | awesome-gamedev-agent-skills @ 0a70cfc `disciplines/audio-design` (Apache-2.0) | none |
| game-playtest | skill | Game playtests: research questions, test type, recruiting and consent, session scripts and observer sheets, think-aloud, surveys, lightweight telemetry, ranked change lists, and keep-or-kill criteria for a build. | New writing (own work). Cites Ambinder GDC 2009, RITE (Medlock et al. 2002), Games User Research (2018), Bromley, Fullerton, Nielsen 2000, PXI (2020), GEQ review (CHI PLAY 2018), TRUE (CHI 2008), Game Analytics (2013). | none |

Files: `plugins/<name>/.claude-plugin/plugin.json`, `skills/<name>/SKILL.md`, `skills/<name>/references/*.md`, `evals/` (3 per plugin), and `LICENSE` (Apache-2.0 full text) plus `NOTICE` (with `Upstream:` and `Paths:` lines) for game-design, game-ui and game-audio.

References:
- game-design: `gdd-template.md`, `balancing.md` (includes a seeded Python simulation template; I ran it and it works), `economy.md` (holds the loot tables).
- game-ui: `layout-and-flow.md`, `accessibility.md`.
- game-audio: `adaptive-music.md`.
- game-playtest: `session-kit.md`, `telemetry.md`.

## Validation

- `claude plugin validate --strict plugins/<name>`: passed for all 4.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>`: valid for all 4.
- SKILL.md bodies are 57 to 72 lines. Descriptions are 320 to 336 characters. References run 78 to 154 lines.
- Grep for codegraph, claude-mem, coding-core:, github:, "Efficient " and the old upstream skill names (godot-ui-control, godot-audio, dialogue-systems, input-systems, Unity): nothing found outside NOTICE and the attribution line.
- No engine versions appear in skill bodies. Engine API is replaced by pointers to the `godot` skill's `ui-control.md`, `localization.md` and `audio.md`, and all three exist.
- Evals: each plugin has 2 trigger cases (fires plus not-neighbour) and 1 routing hard negative: game-design vs game-playtest, game-ui vs web-design, game-audio vs game-feel, game-playtest vs godot-testing. I did not run them.

## Deviations

- **Loudness target corrected.** Upstream said "-14 to -16 LUFS for many games". The port uses -24 LUFS ±2 for console and PC (Sony ASWG-R001) and about -18 LUFS for mobile and handheld, which is PlayStation guidance as reported by Audiokinetic. Gotcha added: -14 LUFS is the music-streaming level. Checked on 2026-10-17 by web search. I did not read the ASWG-R001 PDF itself.
- **game-playtest ships no LICENSE or NOTICE.** It is own work with no upstream, and the repo has no root LICENSE. Add one if the house rule is that every plugin carries a LICENSE.
- **No GodotPrompter material taken**, so no LICENSE-MIT is needed. The review's optional LootTable idea for game-design and the "decision vs fact" idea were not used.
- **Game Accessibility Guidelines license not confirmed.** The design calls the site CC-licensed, but I found no license statement on it. The reference paraphrases and links each guideline and copies no text, so it does not depend on the license. The NOTICE records this.
- `session-kit.md` is 154 lines, slightly over the soft 150 target.

## Unverified / TODO

- The trigger evals were not run (`claude plugin eval`).
- The GEQ review's finding ("factor structure poorly supported") is from memory of the paper. I confirmed the citation, not the full text.
- The CVAA mention in `accessibility.md` is phrased as "check the current FCC rules".

## Follow-ups

- The coordinator registers the 4 plugins in the marketplace and in `gamedev-core` dependencies.
- Run the evals with the full godot-meta installed, especially game-ui against godot and game-audio against godot.
