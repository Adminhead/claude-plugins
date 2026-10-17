# Batch godot-1b report

## Plugins created

| Name | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| godot-mcp-setup | skill, manual (`disable-model-invocation: true`) + `scripts/install-addon.sh` | Manual /godot-mcp-setup: installs the voidrot/godot-mcp editor addon into a Godot 4.7+ project, enables it, reads its port and writes the project .mcp.json godot-editor entry after you approve the diff. | New (own work). Facts from ~/Projects/voidrot/godot-mcp @ f065913fb50e1de5bc6b9850b1e0157365ff9c11 (read only) and the Claude Code MCP docs (headersHelper cwd, timeout). | none |
| godot-testing | skill + references/gut.md, references/gdunit4.md, 3 evals | Godot 4 testing skill: picks GUT, gdUnit4 or a bare SceneTree runner from the project, writes tests, runs them headless with real exit codes, and sets up CI, with GUT and gdUnit4 references. | awesome-gamedev-agent-skills @ 0a70cfc (Apache-2.0) `godot-gdscript-headless-testing`; GodotPrompter @ bd9d180 (MIT) `godot-testing` (table, layout, naming, what-not-to-test only); references written from GUT v9.7.1 and gdUnit4 v6.2.2 docs/code and gdUnit4-action v1.3.2 | none |

godot-testing ships LICENSE (Apache-2.0), LICENSE-MIT (GodotPrompter) and NOTICE with the two `Upstream:`/`Paths:` lines. godot-mcp-setup is own work and ships no LICENSE/NOTICE (no third-party text; the addon is the user's MIT repo and is downloaded at run time, not bundled).

## Validation and tests

- `claude plugin validate --strict plugins/godot-mcp-setup`: passed. Same for `plugins/godot-testing`: passed.
- `validate_skill.py` on both skills: valid.
- `bash plugins/godot-mcp-setup/tests/install-addon-spec.sh`: 17/17 pass (offline synthetic tarballs: dry-run, install, update, only the addon copied, refusals for missing project.godot, symlinked addons/, symlink inside the addon, `..` paths, no addon in archive, non-tarball, bad usage exit 2). shellcheck clean on script and spec.
- Real tarball: `git archive --prefix=godot-mcp-HEAD/ HEAD` of ~/Projects/voidrot/godot-mcp, fed through `GODOT_MCP_TARBALL`: installed 0.1.0, commit f065913 read from the archive via `git get-tar-commit-id`.
- Headless port step with godot-mono 4.7.2: after enabling the plugin, `timeout 60 godot-mono --headless --editor --quit-after 100 --path .` printed `godot_mcp: serving http://127.0.0.1:6550/mcp` in ~3 s and saved `[godot_mcp] server/port=6550`; `cat .godot/godot_mcp/headers.json` prints a JSON object of strings (`Authorization`). Without `--quit-after` the editor runs to the 60 s timeout, so the skill uses it.
- Bare SceneTree runner (godot-testing section 4) run with godot-mono 4.7.2: exit 0 on pass, 1 on a failure; a failed `assert()` in `_initialize()` hangs until `timeout` (rc 124), confirming upstream's pitfall.
- grep for codegraph / claude-mem / coding-core: / github: / Efficient: none.

## Deviations and decisions

- Download URL: `https://github.com/voidrot/godot-mcp/archive/HEAD.tar.gz` (the addon README's form; the design named the equivalent codeload URL). The repo is NOT published yet, so the live download is untested; only the local-tarball path is tested.
- install-addon.sh has `--dry-run` so the skill can show the version change before replacing `addons/godot_mcp/`; the allowed-tools grant covers only the dry run.
- Step 3 of the skill tells the user to enable the plugin in the editor when it is open (the editor rewrites project.godot and would drop a hand edit; also it drops enabled entries whose plugin.cfg is missing, seen in the test).
- Monorepo: relative `cat <subdir>/.godot/...` headersHelper as instructed (Claude Code docs confirm a project .mcp.json helper runs in the project dir). Added: the addon writes its agent skill under the Godot subfolder's `.claude/`, which a session at the repo root does not load; the skill offers to move it.
- godot-testing layout uses `res://test/` (both GUT's suggested setup and gdUnit4's default root), not GodotPrompter's `tests/`.
- GodotPrompter errors corrected besides those in the review: gdUnit4 CLI is not `gdunit4_runner`; gdUnit4 discovers suites by base class and names generated files `<name>_test.gd` (not `test_*.gd`); GUT config is `res://.gutconfig.json` (not `gut_config.json`); gdUnit4 float matcher is `is_equal_approx`/`IsEqualApprox` (not `is_approximately`); gdUnit4 has no `assert_bool`.
- New gotchas from the sources: gdUnit4's CLI is fail-fast unless `-c`; exit codes 103/104/105; `runtest.sh` can't take `--headless` (args go after the tool path), so headless needs a direct Godot call with `--ignoreHeadlessMode` or `xvfb-run` (what the official action does); `-d` can hang CI at a `debug>` prompt; GUT 9.5+ fails tests on unexpected errors.
- Added 3 evals to godot-testing (2 triggers, 1 Jest hard negative); none for the manual skill.

## Unverified / TODO

- GUT and gdUnit4 were not executed (third-party code rule); their CLI commands come from docs and source. In particular the direct headless gdUnit4 command is derived from runtest.sh and GdUnitCmdTool's arg parser, not run.
- gdUnit4 v6.2.x lists Godot up to 4.7.1; 4.7.2 support is not stated (noted in the reference).
- `chickensoft-games/setup-godot@v2` (latest v2.4.3) inputs `version`/`use-dotnet` taken from its README.
- Evals not run.
- The live MCP connection (Claude Code approving the server and calling get_project_info) was not exercised.

## Follow-ups

- Publish github.com/voidrot/godot-mcp, then run `install-addon.sh --dry-run` against the real URL.
- Run `claude plugin eval plugins/godot-testing` once registered.
- `test-run` runner detection for GUT / gdUnit4 / `godot --headless --script` (design follow-up).
- Optional: try GUT 9.7.1 and gdUnit4 6.2.2 headless in a throwaway project to confirm the documented commands.
