import json
import shutil
import sys
from pathlib import Path

import pytest

import plugins

REPO = Path(__file__).resolve().parent.parent


@pytest.fixture
def root(tmp_path):
    (tmp_path / ".claude-plugin").mkdir()
    (tmp_path / ".claude-plugin/marketplace.json").write_text(json.dumps({
        "name": "adminhead",
        "owner": {"name": "AdminHead"},
        "allowCrossMarketplaceDependenciesOn": ["claude-code-lsps"],
        "plugins": [],
    }))
    (tmp_path / "README.md").write_text(f"# x\n\n{plugins.CATALOG_START}\n{plugins.CATALOG_END}\n")
    meta = {"name": "python-meta", "version": "0.1.0", "description": "Python set.", "dependencies": []}
    plugins.write_json(tmp_path / "plugins/python-meta/.claude-plugin/plugin.json", meta)
    market = json.loads((tmp_path / ".claude-plugin/marketplace.json").read_text())
    market["plugins"].append({"name": "python-meta", "source": "./plugins/python-meta",
                              "description": "Python set.", "version": "0.1.0", "category": "meta"})
    plugins.write_json(tmp_path / ".claude-plugin/marketplace.json", market)
    plugins.write_catalog(tmp_path)
    return tmp_path


def run(root, *argv):
    return plugins.main(list(argv), root=root)


@pytest.mark.parametrize("kind", plugins.KINDS)
def test_new_plugin_passes_check(root, kind):
    run(root, "new", "uv-lock", "--kind", kind, "--description", "Locks deps.", "--meta", "python-meta")
    assert plugins.check(root) == []
    meta = json.loads((root / "plugins/python-meta/.claude-plugin/plugin.json").read_text())
    assert meta["dependencies"] == ["uv-lock"]
    readme = (root / "README.md").read_text()
    assert f"| [`uv-lock`](plugins/uv-lock) | {kind} | Locks deps. | `python-meta` |" in readme


def test_new_rejects_meta_names_and_unknown_metas(root):
    with pytest.raises(SystemExit):
        run(root, "new", "go-meta", "--kind", "skill", "--description", "x")
    with pytest.raises(SystemExit):
        run(root, "new", "uv-lock", "--kind", "skill", "--description", "x", "--meta", "nope-meta")


def test_leaf_with_two_components_fails(root):
    run(root, "new", "uv-lock", "--kind", "skill", "--description", "Locks deps.")
    extra = root / "plugins/uv-lock/agents/helper.md"
    extra.parent.mkdir()
    extra.write_text("---\nname: helper\n---\n")
    assert any("exactly one component, found 2" in e for e in plugins.check(root))


def test_multi_component_allowlist(root, monkeypatch):
    run(root, "new", "uv-lock", "--kind", "skill", "--description", "Locks deps.")
    hooks = root / "plugins/uv-lock/hooks/hooks.json"
    hooks.parent.mkdir()
    hooks.write_text('{"hooks": {}}\n')
    monkeypatch.setitem(plugins.MULTI_COMPONENT, "uv-lock", {("skill", "uv-lock"), ("hook", "hooks/hooks.json")})
    assert not [e for e in plugins.check(root) if e.startswith("uv-lock:")]
    hooks.unlink()
    assert any("MULTI_COMPONENT allows exactly" in e for e in plugins.check(root))


def test_multi_component_allows_lsp(root, monkeypatch):
    run(root, "new", "uv-lock", "--kind", "skill", "--description", "Locks deps.")
    lsp = root / "plugins/uv-lock/.lsp.json"
    lsp.write_text(json.dumps({"metals": {"command": "metals", "extensionToLanguage": {".scala": "scala"}}}))
    assert any("exactly one component, found 2" in e for e in plugins.check(root))
    monkeypatch.setitem(plugins.MULTI_COMPONENT, "uv-lock", {("skill", "uv-lock"), ("lsp", "metals")})
    assert not [e for e in plugins.check(root) if e.startswith("uv-lock:")]
    lsp.unlink()
    assert any("MULTI_COMPONENT allows exactly" in e for e in plugins.check(root))


def test_multi_component_rejects_third_component(root, monkeypatch):
    run(root, "new", "uv-lock", "--kind", "skill", "--description", "Locks deps.")
    (root / "plugins/uv-lock/.lsp.json").write_text(json.dumps({
        "metals": {"command": "metals", "extensionToLanguage": {".scala": "scala"}},
        "other": {"command": "other", "extensionToLanguage": {".x": "x"}},
    }))
    monkeypatch.setitem(plugins.MULTI_COMPONENT, "uv-lock", {("skill", "uv-lock"), ("lsp", "metals")})
    assert any("MULTI_COMPONENT allows exactly" in e for e in plugins.check(root))


def test_scala_is_allowed_a_metals_lsp():
    assert plugins.MULTI_COMPONENT["scala"] == {("skill", "scala"), ("lsp", "metals")}


def test_supporting_files_do_not_count(root):
    run(root, "new", "uv-lock", "--kind", "hook", "--description", "Locks deps.")
    script = root / "plugins/uv-lock/scripts/run.sh"
    script.parent.mkdir()
    script.write_text("#!/bin/sh\n")
    assert plugins.check(root) == []


def test_meta_with_component_fails(root):
    skill = root / "plugins/python-meta/skills/x/SKILL.md"
    skill.parent.mkdir(parents=True)
    skill.write_text("---\nname: x\n---\n")
    assert any("meta plugin ships only plugin.json" in e for e in plugins.check(root))


def test_meta_depending_on_meta_fails(root):
    path = root / "plugins/python-meta/.claude-plugin/plugin.json"
    manifest = json.loads(path.read_text())
    manifest["dependencies"] = ["python-meta"]
    plugins.write_json(path, manifest)
    plugins.write_catalog(root)
    assert any("depends on meta plugin" in e for e in plugins.check(root))


def test_cross_marketplace_dependency_needs_allowlist(root):
    path = root / "plugins/python-meta/.claude-plugin/plugin.json"
    manifest = json.loads(path.read_text())
    manifest["dependencies"] = [{"name": "pyright", "marketplace": "claude-code-lsps"}, "ruff@other"]
    plugins.write_json(path, manifest)
    plugins.write_catalog(root)
    errors = plugins.check(root)
    assert errors == ["python-meta: dependency ruff@other is not in allowCrossMarketplaceDependenciesOn"]


def test_drift_fails(root):
    run(root, "new", "uv-lock", "--kind", "skill", "--description", "Locks deps.")
    path = root / "plugins/uv-lock/.claude-plugin/plugin.json"
    manifest = json.loads(path.read_text())
    manifest["version"] = "0.2.0"
    plugins.write_json(path, manifest)
    shutil.rmtree(root / "plugins/python-meta")
    errors = plugins.check(root)
    assert "uv-lock: version differs between plugin.json and marketplace.json" in errors
    assert "python-meta: listed in marketplace.json but plugins/python-meta is missing" in errors


def test_stale_catalog_fails(root):
    run(root, "new", "uv-lock", "--kind", "skill", "--description", "Locks deps.")
    for path in (root / "plugins/uv-lock/.claude-plugin/plugin.json", root / ".claude-plugin/marketplace.json"):
        path.write_text(path.read_text().replace("Locks deps.", "Locks dependencies."))
    assert plugins.check(root) == ["README.md: plugin catalog is stale; run scripts/plugins.py catalog"]
    assert run(root, "catalog", "--check") == 1
    run(root, "catalog")
    assert plugins.check(root) == []


def add_bundle(root, name="programming-core", deps=()):
    plugins.write_json(root / f"plugins/{name}/.claude-plugin/plugin.json",
                       {"name": name, "version": "0.1.0", "description": "Core.", "dependencies": list(deps)})
    path = root / ".claude-plugin/marketplace.json"
    market = json.loads(path.read_text())
    market["plugins"].append({"name": name, "source": f"./plugins/{name}", "description": "Core.", "version": "0.1.0", "category": "bundle"})
    plugins.write_json(path, market)


def set_deps(root, name, deps):
    path = root / f"plugins/{name}/.claude-plugin/plugin.json"
    manifest = json.loads(path.read_text())
    manifest["dependencies"] = deps
    plugins.write_json(path, manifest)


def test_meta_may_depend_on_bundle(root):
    add_bundle(root)
    run(root, "new", "coding", "--kind", "skill", "--description", "Codes.", "--meta", "programming-core")
    set_deps(root, "python-meta", ["programming-core"])
    plugins.write_catalog(root)
    assert plugins.check(root) == []
    readme = (root / "README.md").read_text()
    assert "### Core bundles" in readme
    assert "| [`programming-core`](plugins/programming-core) | `coding` | `python-meta` | Core. |" in readme
    assert "| [`coding`](plugins/coding) | skill | Codes. | `programming-core` |" in readme


def test_bundle_rules(root):
    add_bundle(root, "a-core")
    add_bundle(root, "b-core", ["a-core", "python-meta"])
    run(root, "new", "uv-lock", "--kind", "skill", "--description", "Locks deps.")
    set_deps(root, "uv-lock", ["a-core"])
    skill = root / "plugins/a-core/skills/x/SKILL.md"
    skill.parent.mkdir(parents=True)
    skill.write_text("---\nname: x\n---\n")
    plugins.write_catalog(root)
    errors = plugins.check(root)
    assert "b-core: only meta plugins may depend on core bundle a-core" in errors
    assert "b-core: depends on meta plugin python-meta; list its plugins instead" in errors
    assert "uv-lock: only meta plugins may depend on core bundle a-core" in errors
    assert any(e.startswith("a-core: a core bundle ships only plugin.json") for e in errors)


def test_core_suffix_alone_is_not_a_bundle(root):
    run(root, "new", "ef-core", "--kind", "skill", "--description", "EF Core.")
    assert plugins.check(root) == []
    add_bundle(root)
    with pytest.raises(SystemExit):
        run(root, "new", "programming-core", "--kind", "skill", "--description", "x")


def test_register_marks_deps_only_dirs_as_bundles(root):
    plugins.write_json(root / "plugins/game-core/.claude-plugin/plugin.json",
                       {"name": "game-core", "version": "0.1.0", "description": "Games.", "dependencies": []})
    run(root, "register", "--meta", "python-meta=game-core")
    market = json.loads((root / ".claude-plugin/marketplace.json").read_text())
    assert {e["name"]: e.get("category") for e in market["plugins"]}["game-core"] == "bundle"
    assert plugins.check(root) == []


def test_register_lists_new_dirs_and_assigns_metas(root):
    plugins.write_json(root / "plugins/uv-lock/.claude-plugin/plugin.json",
                       {"name": "uv-lock", "version": "0.1.0", "description": "Locks deps."})
    skill = root / "plugins/uv-lock/skills/uv-lock/SKILL.md"
    skill.parent.mkdir(parents=True)
    skill.write_text("---\nname: uv-lock\ndescription: Locks deps.\n---\n")
    run(root, "register", "--meta", "python-meta=uv-lock")
    run(root, "register", "--meta", "python-meta=uv-lock")
    meta = json.loads((root / "plugins/python-meta/.claude-plugin/plugin.json").read_text())
    assert meta["dependencies"] == ["uv-lock"]
    assert plugins.check(root) == []


def test_shared_copies_must_match(root):
    run(root, "new", "guard", "--kind", "hook", "--description", "Guards.")
    canonical = root / "scripts/shared/shell/walk.ts"
    canonical.parent.mkdir(parents=True)
    canonical.write_text("export const v = 1\n")
    copy = root / "plugins/guard/scripts/shell/walk.ts"
    copy.parent.mkdir(parents=True)
    copy.write_text("export const v = 0\n")
    assert any("differs from scripts/shared/shell/walk.ts" in e for e in plugins.check(root))
    run(root, "sync-shared")
    assert copy.read_text() == canonical.read_text()
    assert plugins.check(root) == []


def test_upstream_lists_commits_since_notice(root, capsys):
    import subprocess
    up = root / "3rd-party/up"
    up.mkdir(parents=True)
    g = lambda *a: subprocess.run(["git", "-C", str(up), *a], check=True, capture_output=True, text=True).stdout.strip()
    g("init", "-q")
    g("config", "user.email", "t@example.com")
    g("config", "user.name", "t")
    g("remote", "add", "origin", "git@github.com:owner/up.git")
    (up / "skill.md").write_text("v1\n")
    g("add", ".")
    g("commit", "-qm", "first")
    base = g("rev-parse", "HEAD")
    (up / "skill.md").write_text("v2\n")
    (up / "other.md").write_text("x\n")
    g("add", ".")
    g("commit", "-qm", "change skill")
    run(root, "new", "port", "--kind", "skill", "--description", "Ported.")
    (root / "plugins/port/NOTICE").write_text(f"Upstream: https://github.com/owner/up @ {base}\nPaths: skill.md\n")
    run(root, "upstream", "port")
    out = capsys.readouterr().out
    assert "port: 1 upstream commit(s) since" in out and "change skill" in out
    (root / "plugins/port/NOTICE").write_text(f"Upstream: https://github.com/owner/up @ {g('rev-parse', 'HEAD')}\nPaths: skill.md\n")
    run(root, "upstream")
    assert "port: up to date" in capsys.readouterr().out



def test_godot_descriptions_name_no_minor_version(root):
    run(root, "new", "godot-foo", "--kind", "skill", "--description", "Foo for Godot 4.7 projects.")
    assert any("names a Godot minor version" in e for e in plugins.check(root))


def test_catalog_lists_agents_with_their_plugin(root):
    run(root, "new", "helper", "--kind", "agent", "--description", "Helps.", "--meta", "python-meta")
    path = root / "plugins/helper/agents/helper.md"
    path.write_text(path.read_text().replace("tools: Read, Grep, Glob", "model: haiku\neffort: medium\ntools: Read, Grep, Glob"))
    plugins.write_catalog(root)
    readme = (root / "README.md").read_text()
    assert "### Agents" in readme
    assert "| `helper:helper` | [`helper`](plugins/helper) | haiku | medium | no | `python-meta` |" in readme


def test_subagents_cannot_spawn_agents(root):
    run(root, "new", "helper", "--kind", "agent", "--description", "Helps.")
    path = root / "plugins/helper/agents/helper.md"
    assert plugins.check(root) == []
    path.write_text(path.read_text().replace("tools: Read, Grep, Glob", "tools: Read, Agent"))
    assert any("must not list Agent" in e for e in plugins.check(root))
    path.write_text(path.read_text().replace("tools: Read, Agent\n", "disallowedTools: Agent\n"))
    assert any("disallowedTools must include Workflow" in e for e in plugins.check(root))
    path.write_text(path.read_text().replace("disallowedTools: Agent", "disallowedTools: Agent, Workflow"))
    assert [e for e in plugins.check(root) if not e.startswith("README.md")] == []


def add_plugin(root, name, deps=()):
    plugins.write_json(root / f"plugins/{name}/.claude-plugin/plugin.json",
                       {"name": name, "version": "0.1.0", "description": "Set.", "dependencies": list(deps)})
    path = root / ".claude-plugin/marketplace.json"
    market = json.loads(path.read_text())
    market["plugins"].append({"name": name, "source": f"./plugins/{name}", "description": "Set.", "version": "0.1.0",
                              "category": "meta" if plugins.is_meta(name) else "development"})
    plugins.write_json(path, market)
    plugins.write_catalog(root)


def test_exclusive_metas_must_not_share_plugins(root):
    add_plugin(root, "github-meta", ["git-tool", "gh-only"])
    add_plugin(root, "forgejo-meta", ["git-tool", "forge-only"])
    add_plugin(root, "git-tool", ["shared-lib"])
    add_plugin(root, "shared-lib")
    add_plugin(root, "gh-only")
    add_plugin(root, "forge-only")
    errors = plugins.check(root)
    assert "github-meta and forgejo-meta must not share git-tool, shared-lib; scope them per forge" in errors


def test_exclusive_metas_may_share_through_baseline(root):
    add_plugin(root, "github-meta", ["git-tool"])
    add_plugin(root, "forgejo-meta", ["git-tool"])
    add_plugin(root, "baseline", ["git-tool"])
    add_plugin(root, "git-tool")
    assert not [e for e in plugins.check(root) if "must not share" in e]


def test_exclusive_metas_skip_when_absent(root):
    add_plugin(root, "github-meta", ["git-tool"])
    add_plugin(root, "git-tool")
    assert not [e for e in plugins.check(root) if "must not share" in e]


def test_closure_terminates_on_cycles_and_skips_foreign_deps():
    manifests = {
        "a": {"dependencies": ["b", "missing", "x@other"]},
        "b": {"dependencies": ["a", {"name": "c", "marketplace": "other"}]},
        "c": None,
    }
    assert plugins.closure("a", manifests) == {"a", "b"}
    assert plugins.closure("c", manifests) == {"c"}
    assert plugins.closure("missing", manifests) == set()


def test_closure_follows_deps_naming_the_own_marketplace():
    manifests = {
        "a": {"dependencies": ["b@mine", "x@other"]},
        "b": {"dependencies": []},
        "x": {"dependencies": []},
    }
    assert plugins.closure("a", manifests, "mine") == {"a", "b"}
    assert plugins.closure("a", manifests) == {"a"}


def test_exclusive_metas_share_detected_through_own_marketplace_deps(root):
    own = plugins.load_json(root / plugins.MARKETPLACE)["name"]
    add_plugin(root, "github-meta", [f"gh-pr@{own}"])
    add_plugin(root, "forgejo-meta", [f"gh-pr@{own}"])
    add_plugin(root, "gh-pr")
    errors = plugins.check(root)
    assert "github-meta and forgejo-meta must not share gh-pr; scope them per forge" in errors


@pytest.mark.xfail(reason="the apply slices (B2, C1 to C3) clear the violations the new rules report; drop this mark then")
def test_repo_passes_check():
    assert plugins.check(REPO) == []


# --- Frontmatter, eval cases, categories, root suites, --since ---------------

FIRES = "---\ntype: tool_used\ntool: Skill\ninput_match: '\"skill\"\\s*:\\s*\"(?:[\\w-]+:)?{skill}\"'\n{extra}---\n"


def fires(skill, extra=""):
    return FIRES.replace("{skill}", skill).replace("{extra}", extra)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def add_case(root, plugin, case="c1", graders=None, fm="", base=None):
    """A valid prompt.md case with graders; `base` overrides the cases directory."""
    d = (base or root / "plugins" / plugin / "evals") / case
    shutil.rmtree(d, ignore_errors=True)
    write(d / "prompt.md", f"---\nname: {case}\ndescription: A case.\ntags: [routing]\nmax_turns: 5\nallowed_tools: [Skill]\n{fm}---\nDo it.\n")
    for stem, text in (graders if graders is not None else {"fires": fires(plugin)}).items():
        write(d / "graders" / f"{stem}.md", text)
    return d


def errs(root, needle=None):
    found = plugins.check(root)
    return [e for e in found if needle in e] if needle else found


@pytest.fixture
def uv(root):
    run(root, "new", "uv-lock", "--kind", "skill", "--description", "Locks deps.")
    return root


def test_valid_case_passes(uv):
    add_case(uv, "uv-lock")
    assert plugins.check(uv) == []


def test_skill_with_nested_quotes_fails_yaml(uv):
    path = uv / "plugins/uv-lock/skills/uv-lock/SKILL.md"
    path.write_text("---\nname: uv-lock\ndescription: Use when \"lock\" is asked: really\n---\n")
    assert any("SKILL.md: invalid YAML" in e for e in plugins.check(uv))


def test_duplicate_yaml_key_fails(uv):
    path = uv / "plugins/uv-lock/skills/uv-lock/SKILL.md"
    path.write_text("---\nname: uv-lock\ndescription: A.\ndescription: B.\n---\n")
    assert any("duplicate key 'description'" in e for e in plugins.check(uv))


def test_unquoted_colon_in_root_suite_prompt_fails(uv):
    d = add_case(uv, "uv-lock", base=uv / "evals/suite/evals", fm="plugins: ['../../../../plugins/uv-lock']\n")
    (d / "prompt.md").write_text(
        "---\nname: c1\ndescription: Outcome: locks\nplugins: ['../../../../plugins/uv-lock']\n---\nDo it.\n")
    assert any("evals/suite/evals/c1/prompt.md: invalid YAML" in e for e in plugins.check(uv))


def test_invalid_grader_yaml_fails(uv):
    add_case(uv, "uv-lock", graders={"bad": "---\ntype: regex\npattern: a: b\n---\n"})
    assert any("graders/bad.md: invalid YAML" in e for e in plugins.check(uv))


def test_case_without_graders_fails(uv):
    add_case(uv, "uv-lock", graders={})
    assert any("needs at least one grader" in e for e in plugins.check(uv))


def test_missing_plugins_path_fails(uv):
    add_case(uv, "uv-lock", fm="plugins: ['../../nope']\n")
    assert any("does not resolve to a plugin directory" in e for e in plugins.check(uv))
    add_case(uv, "uv-lock", fm="plugins: ['../..']\n")
    assert plugins.check(uv) == []


def test_missing_third_party_checkout_is_a_warning(uv):
    add_case(uv, "uv-lock", fm="plugins: ['../..', '../../../../3rd-party/ext']\n")
    warnings = set()
    assert plugins.check(uv, warnings=warnings) == []
    assert any("optional checkout missing: 3rd-party/ext" in w for w in warnings)


def test_uncompilable_and_inline_flag_regex_fail(uv):
    add_case(uv, "uv-lock", graders={
        "open": "---\ntype: regex\npattern: '(unclosed'\n---\n",
        "flag": "---\ntype: regex\npattern: '(?i)hello'\n---\n",
        "ok": "---\ntype: regex\npattern: 'hello'\nflags: i\n---\n",
        "fires": fires("uv-lock")})
    found = plugins.check(uv)
    assert any("graders/open.md: pattern does not compile" in e for e in found)
    assert any("graders/flag.md" in e and "inline (?i)-style flag" in e for e in found)
    assert not any("graders/ok.md" in e for e in found)


def test_missing_node_skips_regex_rules_with_a_warning(uv, monkeypatch):
    add_case(uv, "uv-lock", graders={"open": "---\ntype: regex\npattern: '(unclosed'\n---\n"})
    monkeypatch.setenv("PATH", "")
    warnings = set()
    assert plugins.check(uv, warnings=warnings) == []
    assert any("node is not on PATH" in w for w in warnings)


def test_skill_grader_for_unknown_skill_fails(uv):
    add_case(uv, "uv-lock", graders={"fires": fires("no-such-skill")})
    assert any("matches no known skill" in e for e in plugins.check(uv))


def test_external_skills_are_allowed(uv):
    add_case(uv, "uv-lock", graders={"a": fires("skill-creator"), "b": fires("gradle-skills:x".replace("x", "wrapper")),
                                     "c": fires("uv-lock")})
    assert plugins.check(uv) == []


def test_skill_max_zero_needs_arm_both(uv):
    run(uv, "new", "other", "--kind", "skill", "--description", "Other.")
    add_case(uv, "uv-lock", fm="plugins: ['../..', '../../../other']\n",
             graders={"fires": fires("uv-lock"), "not": fires("other", "min: 0\nmax: 0\n")})
    assert any("needs arm: both" in e for e in plugins.check(uv))
    add_case(uv, "uv-lock", fm="plugins: ['../..', '../../../other']\n",
             graders={"fires": fires("uv-lock"), "not": fires("other", "min: 0\nmax: 0\narm: both\n")})
    assert plugins.check(uv) == []


def test_bash_max_zero_needs_no_arm(uv):
    add_case(uv, "uv-lock", graders={"fires": fires("uv-lock"),
                                     "no-admin": "---\ntype: tool_used\ntool: Bash\ninput_match: 'rm'\nmin: 0\nmax: 0\n---\n"})
    assert plugins.check(uv) == []


def test_inert_sibling_grader_fails(uv):
    run(uv, "new", "other", "--kind", "skill", "--description", "Other.")
    neg = fires("other", "min: 0\nmax: 0\narm: both\n")
    add_case(uv, "uv-lock", graders={"fires": fires("uv-lock"), "not": neg})
    assert any("inert sibling grader" in e and "targets other" in e for e in plugins.check(uv))
    add_case(uv, "uv-lock", fm="plugins: ['../..', '../../../other']\n", graders={"fires": fires("uv-lock"), "not": neg})
    assert plugins.check(uv) == []


def test_negative_for_own_skill_is_not_inert(uv):
    add_case(uv, "uv-lock", graders={"not": fires("uv-lock", "min: 0\nmax: 0\narm: both\n")})
    assert plugins.check(uv) == []


def test_manual_only_skill_cannot_fire_in_routing(uv):
    path = uv / "plugins/uv-lock/skills/uv-lock/SKILL.md"
    path.write_text("---\nname: uv-lock\ndescription: Locks.\ndisable-model-invocation: true\n---\n")
    add_case(uv, "uv-lock")
    assert any("manual-only skill uv-lock" in e for e in plugins.check(uv))
    add_case(uv, "uv-lock", graders={"not": fires("uv-lock", "min: 0\nmax: 0\narm: both\n")})
    assert plugins.check(uv) == []


def test_name_must_match_dir_and_pattern(uv):
    path = uv / "plugins/uv-lock/skills/uv-lock/SKILL.md"
    path.write_text("---\nname: other\ndescription: Locks.\n---\n")
    assert any("name 'other' must equal 'uv-lock'" in e for e in plugins.check(uv))
    run(uv, "new", "helper", "--kind", "agent", "--description", "Helps.")
    agent = uv / "plugins/helper/agents/helper.md"
    agent.write_text(agent.read_text().replace("name: helper", "name: Helper"))
    assert any("agents/helper.md: name 'Helper' must equal 'helper'" in e for e in plugins.check(uv))


def test_description_length_limit(uv):
    path = uv / "plugins/uv-lock/skills/uv-lock/SKILL.md"
    path.write_text(f"---\nname: uv-lock\ndescription: {'x' * 1100}\n---\n")
    assert any("description is 1100 chars" in e for e in plugins.check(uv))
    path.write_text("---\nname: uv-lock\ndescription: ''\n---\n")
    assert any("description must be a non-empty string" in e for e in plugins.check(uv))


def test_agents_must_not_set_auto_compact_window(uv):
    run(uv, "new", "helper", "--kind", "agent", "--description", "Helps.")
    agent = uv / "plugins/helper/agents/helper.md"
    agent.write_text(agent.read_text().replace("tools:", "autoCompactWindow: 100000\ntools:"))
    assert any("remove autoCompactWindow" in e for e in plugins.check(uv))


def set_category(root, name, category):
    path = root / ".claude-plugin/marketplace.json"
    market = json.loads(path.read_text())
    for entry in market["plugins"]:
        if entry["name"] == name:
            entry["category"] = category
    plugins.write_json(path, market)


def test_category_rules(uv):
    set_category(uv, "uv-lock", "meta")
    assert any("uv-lock: marketplace category is 'meta'" in e for e in plugins.check(uv))
    set_category(uv, "uv-lock", "tools")
    assert any("uv-lock: marketplace category 'tools' must be one of" in e for e in plugins.check(uv))
    set_category(uv, "uv-lock", "development")
    set_category(uv, "python-meta", "development")
    assert any("python-meta: marketplace category is 'development'; it must be meta" in e for e in plugins.check(uv))
    set_category(uv, "python-meta", "meta")
    assert plugins.check(uv) == []


def test_unknown_keys_and_bad_values_fail(uv):
    add_case(uv, "uv-lock", fm="surprise: 1\nruns: 99\nenv: {FOO: bar}\n",
             graders={"fires": fires("uv-lock", "colour: red\n"), "bad": "---\ntype: telepathy\n---\n",
                      "rx": "---\ntype: regex\nmatch: sometimes\n---\n"})
    found = "\n".join(plugins.check(uv))
    for needle in ("unknown key 'surprise'", "runs must be an integer from 1 to 50", "env key 'FOO'",
                   "unknown tool_used grader key 'colour'", "grader type 'telepathy'", "regex grader needs pattern",
                   "match must be contains"):
        assert needle in found


def test_prompt_frontmatter_overrides_case_yaml_and_graders_combine(uv):
    d = uv / "plugins/uv-lock/evals/c1"
    write(d / "case.yaml", "schema_version: '1.1'\nname: c1\nruns: 99\nplugins: ['../../nope']\n"
          "graders:\n  - {name: g1, type: regex, pattern: 'x'}\n")
    write(d / "prompt.md", "---\nruns: 3\nplugins: ['../..']\n---\nDo it.\n")
    assert plugins.check(uv) == []
    write(d / "prompt.md", "---\nruns: 3\n---\nDo it.\n")
    assert any("does not resolve to a plugin directory" in e for e in plugins.check(uv))
    write(d / "graders/g1.md", "---\ntype: regex\npattern: 'y'\n---\n")
    assert any("duplicate grader name 'g1'" in e for e in plugins.check(uv))


def test_case_yaml_needs_schema_version_and_name(uv):
    write(uv / "plugins/uv-lock/evals/c1/case.yaml", "execution:\n  prompt: hi\ngraders:\n  - {type: regex, pattern: x}\n")
    found = "\n".join(plugins.check(uv))
    assert 'schema_version must be "1.1"' in found and "name is required" in found


def suite_root(root):
    for leaf in ("a-skill", "b-skill", "grep-app"):
        run(root, "new", leaf, "--kind", "skill", "--description", f"{leaf}.")
    set_deps(root, "python-meta", ["a-skill", "b-skill"])
    plugins.write_catalog(root)
    return root


def test_root_suite_closure_drift(root, monkeypatch):
    suite_root(root)
    monkeypatch.setitem(plugins.ROOT_SUITES, "suite", {"metas": ("python-meta",), "extra": (), "exclude": ("grep-app",)})
    base = root / "evals/suite/evals"
    both = "plugins: ['../../../../plugins/a-skill', '../../../../plugins/b-skill']\n"
    add_case(root, "a-skill", base=base, fm=both)
    assert plugins.check(root) == []
    add_case(root, "a-skill", "c2", base=base, fm="plugins: ['../../../../plugins/a-skill']\n")
    add_case(root, "a-skill", "c3", base=base, fm=both.replace("]", ", '../../../../plugins/grep-app']"))
    found = plugins.check(root)
    assert any("c2:" in e and "drifts from the suite closure; missing b-skill" in e for e in found)
    assert any("c3:" in e and "unexpected grep-app" in e for e in found)
    assert not any("c1:" in e for e in found)


def test_real_root_suites_name_real_metas():
    for suite, spec in plugins.ROOT_SUITES.items():
        assert (REPO / "evals" / suite / "evals").is_dir()
        assert all((REPO / "plugins" / m).is_dir() for m in spec["metas"])
    assert "grep-app" in plugins.ROOT_SUITES["godot-meta"]["exclude"]


# --since

def gitc(root, *args):
    r = plugins.git(root, *args)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


@pytest.fixture
def repo(uv):
    gitc(uv, "init", "-q")
    gitc(uv, "config", "user.email", "t@example.com")
    gitc(uv, "config", "user.name", "t")
    gitc(uv, "add", ".")
    gitc(uv, "commit", "-qm", "base")
    return uv


def bump(root, name, version):
    for path in (root / f"plugins/{name}/.claude-plugin/plugin.json", root / ".claude-plugin/marketplace.json"):
        data = json.loads(path.read_text())
        for e in (data["plugins"] if "plugins" in data else [data]):
            if e["name"] == name:
                e["version"] = version
        plugins.write_json(path, data)


def test_since_unbumped_change_fails_and_bump_passes(repo):
    skill = repo / "plugins/uv-lock/skills/uv-lock/SKILL.md"
    skill.write_text(skill.read_text() + "\nMore.\n")
    assert plugins.check(repo) == []
    assert any(e.startswith("uv-lock: changed since HEAD but version 0.1.0 is not greater than 0.1.0")
               for e in plugins.check(repo, since="HEAD"))
    bump(repo, "uv-lock", "0.1.1")
    plugins.write_catalog(repo)
    assert plugins.check(repo, since="HEAD") == []
    bump(repo, "uv-lock", "0.0.9")
    assert any("not greater" in e for e in plugins.check(repo, since="HEAD"))


def test_since_ignores_eval_and_readme_changes(repo):
    add_case(repo, "uv-lock")
    write(repo / "plugins/uv-lock/README.md", "notes\n")
    plugins.write_catalog(repo)
    assert plugins.check(repo, since="HEAD") == []


def test_since_new_plugin_and_untracked_files(repo):
    run(repo, "new", "fresh", "--kind", "skill", "--description", "Fresh.")
    assert plugins.check(repo, since="HEAD") == []
    write(repo / "plugins/uv-lock/scripts/run.sh", "#!/bin/sh\n")
    assert any(e.startswith("uv-lock: changed since HEAD") for e in plugins.check(repo, since="HEAD"))


def test_since_deleted_plugin_passes(repo):
    shutil.rmtree(repo / "plugins/uv-lock")
    assert not [e for e in plugins.check(repo, since="HEAD") if "changed since" in e]


def test_since_rename_is_checked_under_the_new_name(repo):
    gitc(repo, "mv", "plugins/uv-lock/skills/uv-lock/SKILL.md", "plugins/uv-lock/skills/uv-lock/RENAMED.md")
    found = plugins.check(repo, since="HEAD")
    assert any(e.startswith("uv-lock: changed since HEAD") for e in found)
    assert not any(e.startswith("RENAMED") for e in found)


def test_since_rejects_bad_version_and_bad_ref(repo):
    bump(repo, "uv-lock", "1.0")
    skill = repo / "plugins/uv-lock/skills/uv-lock/SKILL.md"
    skill.write_text(skill.read_text() + "\nMore.\n")
    assert any("'1.0' at new is not MAJOR.MINOR.PATCH" in e for e in plugins.check(repo, since="HEAD"))
    with pytest.raises(plugins.RefError):
        plugins.check(repo, since="no-such-ref")
    assert run(repo, "check", "--since", "no-such-ref") == 2


def test_since_meta_dependency_change_needs_bump(repo):
    set_deps(repo, "python-meta", ["uv-lock"])
    plugins.write_catalog(repo)
    assert any(e.startswith("python-meta: changed since HEAD") for e in plugins.check(repo, since="HEAD"))
    bump(repo, "python-meta", "0.1.1")
    plugins.write_catalog(repo)
    assert plugins.check(repo, since="HEAD") == []


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, *sys.argv[1:]]))
