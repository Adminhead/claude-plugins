# Third-party repos

Index of the repos checked out under `3rd-party/` (gitignored). Each repo has a hand-written overview (`README.md`) and a machine-generated `catalog.md` listing every plugin, skill, agent, command and hooks file with its frontmatter description.

Regenerate the catalogs after pulling a repo:

```sh
for d in 3rd-party/*/; do n=$(basename "$d"); python3 -I scripts/catalog-3rd-party.py "$d" "docs/3rd-party/$n/catalog.md"; done
```

Catalog counts are raw file counts. They include per-harness copies (`.codex-plugin`, `.qoder-plugin`, `.openclaw/`) and per-locale copies where a repo ships them, so the overview's Purpose or Quality section gives the canonical number when they differ (ECC, ponytail, awesome-copilot).

Surveyed 2026-10-17.

| Repo | Overview | What it is | Plugins | Skills | Agents | Cmds | Hooks | License | Last commit |
|---|---|---|---|---|---|---|---|---|---|
| [agent-skills](https://github.com/addyosmani/agent-skills) | [overview](agent-skills/README.md) | Addy Osmani's engineering-practice skills (constraint-driven, doubt-driven development) as one plugin with multi-host adapters | 1 | 25 | 4 | 9 | 0 | MIT | 2026-10-13 |
| [android-skills](https://github.com/android/skills) | [overview](android-skills/README.md) | Google's Android skills (Compose, Navigation 3, Glance, Wear, XR, Play, CameraX, LiteRT, AGP 9), grounded in developer.android.com; marketplace `android-skills` | 1 (+1 Codex copy) | 36 | 0 | 0 | 0 | Apache-2.0 | 2026-10-29 |
| [Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills) | [overview](Anthropic-Cybersecurity-Skills/README.md) | 818 flat security skills, not affiliated with Anthropic; much dual-use/offensive content that needs gating | 1 | 818 | 0 | 0 | 0 | Apache-2.0 | 2026-08-31 |
| [anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing) | [overview](anti-ai-slop-writing/README.md) | One skill: banned-word list and numeric caps that constrain generation | 0 | 1 | 0 | 0 | 0 | MIT (no LICENSE file) | 2026-04-19 |
| [awesome-copilot](https://github.com/github/awesome-copilot) | [overview](awesome-copilot/README.md) | GitHub's Copilot collection; the 453 SKILL.md files are Claude-usable, agents/instructions/hooks need conversion | 104 Copilot | 453 | 225 | 0 | 8 | MIT | 2026-10-16 |
| [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | [overview](awesome-gamedev-agent-skills/README.md) | Game-engine skills (Godot, Unity, Unreal, Bevy, web engines) with references dirs | 0 | 75 | 0 | 0 | 0 | Apache-2.0 | 2026-10-09 |
| [chrisbanes-skills](https://github.com/chrisbanes/skills) | [overview](chrisbanes-skills/README.md) | Chris Banes's Kotlin, Jetpack Compose and Android skills plus grounded writing; the workflow skills and router need the port rules; Apache-2.0; port source for android-meta | 1 (+2 manifests) | 20 | 0 | 0 | 0 | Apache-2.0 | 2026-11-01 |
| [claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) | [overview](claude-code-best-practice/README.md) | A documentation course on Claude Code itself (subagents, commands, skills, MCP, memory, settings) with demos | 0 | 9 | 20 | 14 | 1 | MIT | 2026-10-17 |
| [claude-seo](https://github.com/AgriciDaniel/claude-seo) | [overview](claude-seo/README.md) | SEO audit plugin plus a mods companion (seo-cockpit); Python and Playwright setup, optional API keys | 2 | 35 | 22 | 0 | 2 | MIT | 2026-10-05 |
| [claude-skills](https://github.com/Jeffallan/claude-skills) | [overview](claude-skills/README.md) | fullstack-dev-skills: 67 prose skills with 371 reference files across languages, backend, frontend, infra | 1 | 67 | 0 | 10 | 0 | MIT | 2026-10-16 |
| [dotnet-skills](https://github.com/dotnet/skills) | [overview](dotnet-skills/README.md) | The .NET team's official skills: C# refactoring, MSBuild, NuGet, testing, upgrades, diagnostics, ASP.NET Core, Blazor, MAUI; eval-backed, Claude Code marketplace `dotnet-agent-skills` | 16 (+1 unlisted; 3 manifests each) | 105 (+8 maintainer) | 17 Copilot | 2 | 0 | MIT | 2026-10-16 |
| [microsoft-skills](https://github.com/microsoft/skills) | [overview](microsoft-skills/README.md) | Azure SDK and Foundry grounding skills per language (29 for .NET), marketplace `skills`; Azure-specific, work in progress | 13 (+2 unlisted) | 212 (README: 175) | 9 | 18 | 1 | MIT | 2026-10-16 |
| [ECC](https://github.com/affaan-m/ECC) | [overview](ECC/README.md) | Large opinionated workflow kit; canonical 311 skills / 71 agents / 97 commands, the rest are harness and locale copies | 1 (+3 copies) | 1062 | 310 | 457 | 4 | MIT | 2026-10-15 |
| [godot-agent-skills](https://github.com/Qb-Lab/godot-agent-skills) | [overview](godot-agent-skills/README.md) | Qb-Lab's Godot 4.x control layer: Godot 3 API guard, safe .tscn/.tres surgery, headless verification, plus game process and review skills and a scene guard hook | 1 | 20 | 0 | 0 | 1 | MIT | 2026-09-17 |
| [godot-prompter](https://github.com/jame581/GodotPrompter) | [overview](godot-prompter/README.md) | 56 Godot 4.x skills (GDScript + C#, examples checked against 4.7.2 in v1.15.1), 9 persona agents and a SessionStart routing hook; addon skills for Beehave, LimboAI, Phantom Camera, Dialogue Manager, Popochiu | 1 | 66 (56 shipped) | 9 | 0 | 1 | MIT | 2026-10-14 |
| [gradle-skills](https://github.com/gradle/gradle-skills) | [overview](gradle-skills/README.md) | Gradle's official skills: audit a build against Gradle best practices, and upgrade the wrapper | 1 | 2 | 0 | 0 | 0 | Apache-2.0 | 2026-09-30 |
| [humanizer](https://github.com/blader/humanizer) | [overview](humanizer/README.md) | One 26-pattern de-AI-writing edit skill, clean plugin, 5.2k-word prompt | 1 | 1 | 0 | 0 | 0 | MIT | 2026-10-16 |
| [kotlin-agent-skills](https://github.com/Kotlin/kotlin-agent-skills) | [overview](kotlin-agent-skills/README.md) | JetBrains' incubator Kotlin skills (9 tooling, 1 backend), with a Kotlin docs MCP server in the plugin manifest; port source for android-meta | 1 (+1 Codex copy) | 10 | 0 | 0 | 0 | Apache-2.0 | 2026-10-20 |
| [mattpocock](https://github.com/mattpocock/skills) | [overview](mattpocock/README.md) | Matt Pocock's TDD, debugging, code-review and writing-for-agents skills; 27 of 38 shipped in the plugin | 1 | 38 | 0 | 0 | 0 | MIT | 2026-10-09 |
| [paperthin](https://github.com/LilMGenius/paperthin) | [overview](paperthin/README.md) | LilMGenius's 28 plain-Markdown "clean and true" hygiene skills (re0, shower, ssotize, mandela); being ported, see ../plans/paperthin-ports.md | 1 | 28 | 0 | 0 | 0 | MIT | 2026-10-01 |
| [ponytail](https://github.com/DietrichGebert/ponytail) | [overview](ponytail/README.md) | Six skills (12 with the openclaw mirror) plus a working band mod; useful as a mod example | 1 (+2 copies) | 12 | 0 | 0 | 0 | MIT | 2026-10-17 |
| [taste-skill](https://github.com/Leonxlnx/taste-skill) | [overview](taste-skill/README.md) | UI "taste" and art-direction skills; only the core skill bundles references and scripts | 1 (+1 copy) | 14 | 0 | 0 | 0 | MIT | 2026-10-14 |
| [wshobson-agents](https://github.com/wshobson/agents) | [overview](wshobson-agents/README.md) | 92-plugin marketplace in 26 categories; the de facto reference for agent frontmatter conventions; Cedar-gated hooks | 92 (+52 copies) | 185 | 202 | 105 | 2 | MIT | 2026-10-15 |

## Cross-cutting notes

- **Directly cross-installable as plugins:** humanizer, mattpocock, agent-skills, claude-seo (with seo-cockpit), wshobson-agents (selectively), ponytail, taste-skill, claude-skills, ECC.
- **Skill libraries that need wrapping:** Anthropic-Cybersecurity-Skills, awesome-gamedev-agent-skills, awesome-copilot's `skills/`, anti-ai-slop-writing.
- **Reference material rather than installable:** claude-code-best-practice (guides), awesome-copilot's agents and instructions (Copilot format).
- **Mod examples:** ponytail's band mod, claude-seo's seo-cockpit, and this repo's archived coremods under `archive/plugins/coremods/`.
- **Overlaps:** humanizer and anti-ai-slop-writing target the same AI-writing tells; ECC and wshobson-agents share only a handful of names and differ in content.
- The earlier deep review of seven of these repos is archived at `archive/docs/research/third-party-skills-review.md`.
