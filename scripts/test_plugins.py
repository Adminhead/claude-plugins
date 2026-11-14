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



def test_upstream_records_pair_each_upstream_with_its_own_paths(root):
    run(root, "new", "port", "--kind", "skill", "--description", "Ported.")
    (root / "plugins/port/NOTICE").write_text(
        "Upstream: https://github.com/a/one @ abcdef1\nPaths: x/one.md, y\n\n"
        "Upstream: https://github.com/b/two @ 1234567\nPaths: z/two.md\n\n"
        "Upstream: https://github.com/c/three @ fedcba9\n")
    assert list(plugins.upstream_records(root, set())) == [
        ("port", "https://github.com/a/one", "abcdef1", ["x/one.md", "y"]),
        ("port", "https://github.com/b/two", "1234567", ["z/two.md"]),
        ("port", "https://github.com/c/three", "fedcba9", []),
    ]


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


def test_exclusive_metas_may_share_a_forge_neutral_plugin(root, monkeypatch):
    monkeypatch.setattr(plugins, "FORGE_NEUTRAL", {"any-forge"})
    add_plugin(root, "github-meta", ["any-forge", "gh-only"])
    add_plugin(root, "forgejo-meta", ["any-forge", "gh-only"])
    add_plugin(root, "any-forge")
    add_plugin(root, "gh-only")
    errors = [e for e in plugins.check(root) if "must not share" in e]
    assert len(errors) == 1
    assert "gh-only" in errors[0] and "any-forge" not in errors[0]


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


def test_write_json_keeps_non_ascii(tmp_path):
    path = tmp_path / "x.json"
    plugins.write_json(path, {"d": "a → b"})
    assert "→" in path.read_text()


# --- Reference rules: examples, agent values, hook and MCP files, skill links, archive paths ---

def only(root, needle):
    """Errors from `check` that contain `needle`, ignoring the stale-catalog error."""
    return [e for e in plugins.check(root) if needle in e]


def write_example(root, **sections):
    write(root / "examples/claude-settings/settings.global.json", json.dumps(sections))


def test_example_settings_ids_must_name_marketplace_plugins(uv):
    write_example(uv, enabledPlugins={"uv-lock@adminhead": True, "ghost@adminhead": True, "other@elsewhere": True,
                                      "<plugin>@adminhead": False},
                  pluginConfigs={"gone@adminhead": {"options": {}}, "<plugin>@adminhead": {}})
    found = only(uv, "examples/claude-settings")
    assert sorted(e.split(": ", 1)[1].split(" is not")[0] for e in found) == ["enabledPlugins id ghost@adminhead",
                                                                              "pluginConfigs id gone@adminhead"]
    write_example(uv, enabledPlugins={"uv-lock@adminhead": True, "other@elsewhere": True})
    assert only(uv, "examples/claude-settings") == []


def test_example_settings_must_be_valid_json(uv):
    write(uv / "examples/claude-settings/settings.global.json", "{ not json")
    assert only(uv, "settings.global.json: invalid JSON")


def agent_with(root, extra="", tools="Read, Grep, Glob"):
    run(root, "new", "helper", "--kind", "agent", "--description", "Helps.")
    path = root / "plugins/helper/agents/helper.md"
    path.write_text(path.read_text().replace("tools: Read, Grep, Glob\n", f"{extra}tools: {tools}\n" if tools else extra))
    return path


def test_agent_skills_must_resolve(uv):
    agent_with(uv, "skills:\n  - uv-lock:uv-lock\n  - uv-lock\n  - skill-creator\n  - gradle-skills:anything\n")
    assert only(uv, "skills entry") == []
    for bad in ("ghost", "uv-lock:ghost", "ghost:uv-lock"):
        agent_with_path = uv / "plugins/helper/agents/helper.md"
        text = agent_with_path.read_text()
        agent_with_path.write_text(text.replace("skills:\n", f"skills:\n  - {bad}\n"))
        assert any(f"skills entry '{bad}'" in e for e in plugins.check(uv)), bad
        agent_with_path.write_text(text)


def test_agent_skills_must_be_a_list_of_strings(uv):
    path = agent_with(uv, "skills: {a: b}\n")
    assert only(uv, "skills must be a list")
    path.write_text(path.read_text().replace("skills: {a: b}", "skills:\n  - 3"))
    assert only(uv, "skills entry 3")


def test_agent_model_must_be_a_known_alias_or_id(uv):
    path = agent_with(uv)
    for good in ("sonnet", "opus", "haiku", "inherit", "opus[1m]", "claude-opus-5-5", "us.anthropic.claude-sonnet-4-5-v1:0"):
        path.write_text(path.read_text().replace("tools:", f"model: {good}\ntools:", 1))
        assert only(uv, "model") == [], good
        path.write_text(path.read_text().replace(f"model: {good}\n", ""))
    for bad in ("sonet", "gpt-4", "claude", "''"):
        path.write_text(path.read_text().replace("tools:", f"model: {bad}\ntools:", 1))
        assert only(uv, "agents/helper.md: model"), bad
        path.write_text(path.read_text().replace(f"model: {bad}\n", ""))


def test_agent_tools_must_be_non_empty(uv):
    path = agent_with(uv, tools="[Read, Grep]")
    assert only(uv, "tools must") == []
    for bad in ("''", "[]", "[Read, '']"):
        path.write_text(path.read_text().split("tools:")[0] + f"tools: {bad}\n---\n\nBody.\n")
        assert only(uv, "tools must be a non-empty"), bad
    path.write_text(path.read_text().split("tools:")[0] + "tools:\n---\n\nBody.\n")
    assert only(uv, "tools must be a non-empty")


def test_agent_without_tools_or_model_is_left_to_other_rules(uv):
    agent_with(uv, tools=None)
    assert only(uv, "tools must") == [] and only(uv, "model") == []


def test_duplicate_marketplace_entry_fails(uv):
    path = uv / ".claude-plugin/marketplace.json"
    market = json.loads(path.read_text())
    assert only(uv, "more than once") == []
    market["plugins"].append(dict(market["plugins"][-1]))
    plugins.write_json(path, market)
    assert only(uv, "uv-lock: listed more than once")


def hook_plugin(root, hooks_json, files=()):
    run(root, "new", "guard", "--kind", "hook", "--description", "Guards.")
    plugins.write_json(root / "plugins/guard/hooks/hooks.json", hooks_json)
    for rel in files:
        write(root / "plugins/guard" / rel, "x")


COMMAND_HOOK = {"hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [
    {"type": "command", "command": "bun", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/g.ts"]}]}]}}


def test_hooks_json_valid_shapes_pass(root):
    hook_plugin(root, {"description": "d", "hooks": {}})
    assert only(root, "hooks/hooks.json") == []
    hook_plugin_modules = {"modules": ["./register.tsx"]}
    plugins.write_json(root / "plugins/guard/hooks/hooks.json", hook_plugin_modules)
    write(root / "plugins/guard/hooks/register.tsx", "x")
    assert only(root, "hooks/hooks.json") == []
    plugins.write_json(root / "plugins/guard/hooks/hooks.json", {**COMMAND_HOOK, **hook_plugin_modules})
    write(root / "plugins/guard/scripts/g.ts", "x")
    assert only(root, "hooks/hooks.json") == []


def test_hooks_json_bad_json_and_shape_fail(root):
    hook_plugin(root, {})
    path = root / "plugins/guard/hooks/hooks.json"
    path.write_text("{ nope")
    assert only(root, "hooks.json: invalid JSON")
    path.write_text("[]")
    assert only(root, "hooks.json: must be a JSON object")
    # a bare event map, without the top-level "hooks" key, fails to load
    path.write_text(json.dumps(COMMAND_HOOK["hooks"]))
    assert only(root, "needs a \"hooks\" object and/or a \"modules\" list")
    for broken in ({"hooks": []}, {"hooks": {"Stop": {}}}, {"hooks": {"Stop": [{"matcher": "x"}]}},
                   {"hooks": {"Stop": [{"hooks": [{"command": "x"}]}]}},
                   {"hooks": {"Stop": [{"hooks": [{"type": "command"}]}]}},
                   {"modules": "./register.tsx"}, {"modules": [1]}):
        path.write_text(json.dumps(broken))
        assert only(root, "hooks/hooks.json"), broken


def test_hooks_json_dangling_paths_fail(root):
    hook_plugin(root, {**COMMAND_HOOK, "modules": ["./register.tsx"]})
    found = only(root, "hooks/hooks.json")
    assert any("${CLAUDE_PLUGIN_ROOT}/scripts/g.ts does not exist" in e for e in found)
    assert any("module ./register.tsx is not a file inside the plugin" in e for e in found)
    write(root / "plugins/guard/scripts/g.ts", "x")
    write(root / "plugins/guard/hooks/register.tsx", "x")
    assert only(root, "hooks/hooks.json") == []
    # a module must live inside the plugin and a directory is not a module
    write(root / "plugins/escape.tsx", "x")
    plugins.write_json(root / "plugins/guard/hooks/hooks.json", {"modules": ["../../escape.tsx", "../scripts"]})
    assert len(only(root, "is not a file inside the plugin")) == 2


def mcp_plugin(root, content, name="srv"):
    run(root, "new", name, "--kind", "mcp", "--description", "Serves.")
    path = root / f"plugins/{name}/.mcp.json"
    if isinstance(content, str):
        path.write_text(content)
    else:
        plugins.write_json(path, content)
    return path


def test_mcp_json_valid_shapes_pass(root):
    mcp_plugin(root, {"mcpServers": {"a": {"type": "http", "url": "https://x.test/mcp"},
                                     "b": {"command": "sh", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/h.sh"]}}})
    write(root / "plugins/srv/scripts/h.sh", "x")
    assert only(root, ".mcp.json") == []


def test_mcp_json_bad_shapes_fail(root):
    path = mcp_plugin(root, "{ nope")
    assert only(root, ".mcp.json: invalid JSON")
    for bare in ({"sentry": {"command": "npx"}}, []):
        path.write_text(json.dumps(bare))
        assert only(root, ".mcp.json"), bare
    path.write_text(json.dumps({"mcpServers": []}))
    assert only(root, "the top level must be")
    path.write_text(json.dumps({"mcpServers": {"a": {"type": "http"}}}))
    assert only(root, "server 'a' needs a command or a url")
    path.write_text(json.dumps({"mcpServers": {"a": {"command": "sh", "args": ["${CLAUDE_PLUGIN_ROOT}/gone.sh"]}}}))
    assert only(root, "${CLAUDE_PLUGIN_ROOT}/gone.sh does not exist")


def skill_body(root, body):
    path = root / "plugins/uv-lock/skills/uv-lock/SKILL.md"
    path.write_text("---\nname: uv-lock\ndescription: Locks deps. Use when TODO.\n---\n\n" + body)


def test_skill_links_must_exist(uv):
    base = uv / "plugins/uv-lock/skills/uv-lock"
    write(base / "references/a.md", "x")
    write(base / "scripts/run.sh", "x")
    skill_body(uv, "See [a](references/a.md#top), `references/a.md`, [run](./scripts/run.sh) and `scripts/run.sh`.\n")
    assert only(uv, "SKILL.md:") == []
    skill_body(uv, "line\n[gone](references/gone.md) and `references/also-gone.md` and [t](templates/x.txt)\n")
    found = only(uv, "SKILL.md:")
    assert sorted(e.split(" does not exist")[0].split(": ")[1] for e in found) == [
        "references/also-gone.md", "references/gone.md", "templates/x.txt"]
    assert all(e.startswith("plugins/uv-lock/skills/uv-lock/SKILL.md:7:") for e in found)


def test_skill_links_ignore_what_is_not_a_concrete_own_path(uv):
    write(uv / "plugins/uv-lock/skills/uv-lock/references/a.md", "x")
    skill_body(uv, "\n".join([
        "```",
        "see references/gone.md and `references/gone.md`",
        "```",
        "No extension: `references/gone`, a glob `references/*.md`, a placeholder `references/<name>.md`.",
        "Other owners: the `godot` plugin's `references/gone.md`, `postgres` `references/gone.md`, its `references/gone.md`.",
        "A path in the user's project, `assets/gone.prof`, and a repo path, `scripts/gone.py`, with no such dir here.",
        "A URL: [x](https://example.test/references/gone.md) and a parent link [y](../other/references/gone.md).",
        "A line reference `references/gone.md:12` and bare text references/gone.md.",
    ]) + "\n")
    assert only(uv, "SKILL.md:") == []


def test_archive_references_must_exist(uv):
    write(uv / "archive/plugins/old/README.md", "x")
    write(uv / "plugins/uv-lock/README.md", "Moved from archive/plugins/old, see archive/plugins/old/README.md.\n")
    write(uv / "CLAUDE.md", "See archive/plugins/old/ and the pattern archive/plugins/<name>.\n")
    write(uv / ".claude/skills/s/SKILL.md", "ok archive/plugins/old.\n")
    write(uv / "examples/e.md", "ok\n")
    assert only(uv, "archive/plugins") == []
    write(uv / "plugins/uv-lock/README.md", "line one\nMoved from archive/plugins/gone.\n")
    write(uv / "CLAUDE.md", "See `archive/plugins/gone2/evals`.\n")
    write(uv / ".claude/skills/s/SKILL.md", "ok archive/plugins/gone3\n")
    write(uv / "examples/e.md", "see archive/plugins/gone4.\n")
    found = only(uv, "archive/plugins")
    assert sorted(found) == [
        ".claude/skills/s/SKILL.md:1: archive/plugins/gone3 does not exist",
        "CLAUDE.md:1: archive/plugins/gone2 does not exist",
        "examples/e.md:1: archive/plugins/gone4 does not exist",
        "plugins/uv-lock/README.md:2: archive/plugins/gone does not exist",
    ]


def test_archive_references_ignore_files_outside_live_paths_and_binaries(uv):
    write(uv / "docs/plan.md", "archive/plugins/gone\n")
    write(uv / "archive/notes.md", "archive/plugins/gone\n")
    (uv / "plugins/uv-lock/blob.bin").write_bytes(b"\0archive/plugins/gone")
    write(uv / "plugins/uv-lock/node_modules/x/README.md", "archive/plugins/gone\n")
    assert only(uv, "archive/plugins") == []


# --- Retiring plugins: deprecate, archive, retired.json ----------------------

EXAMPLE_GLOBAL = """{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "enabledPlugins": {
    "uv-lock@adminhead": true,
    "uv-new@adminhead": true,
    "other@elsewhere": true
  },
  "pluginConfigs": {
    "uv-lock@adminhead": {
      "options": { "k": "v" }
    }
  }
}
"""


def read(root, rel):
    return json.loads((root / rel).read_text())


def retire_root(root):
    """python-meta lists uv-lock and uv-new; an example settings file enables both."""
    for name in ("uv-lock", "uv-new"):
        run(root, "new", name, "--kind", "skill", "--description", "Locks deps.", "--meta", "python-meta")
    example = root / "examples/claude-settings/settings.global.json"
    example.parent.mkdir(parents=True)
    example.write_text(EXAMPLE_GLOBAL)
    assert plugins.check(root) == []
    return root


def set_retired(root, deprecated=None, archived=None):
    plugins.write_json(root / plugins.RETIRED, {"deprecated": deprecated or {}, "archived": archived or {}})


def rec(into=None, **extra):
    return {"into": into, "reason": "why", "date": "2026-01-02", **extra}


def snapshot(root):
    """Every file a retirement step may write: marketplace, retired.json, README, plugin.json files, example settings."""
    paths = [root / plugins.MARKETPLACE, root / plugins.RETIRED, root / "README.md"]
    paths += sorted(root.glob("plugins/*/.claude-plugin/plugin.json")) + sorted(root.glob("examples/claude-settings/*.json"))
    return {f: f.read_bytes() if f.exists() else None for f in paths}


def refuses(root, *argv):
    """The command exits with a message and changes none of the files a retirement step writes."""
    before = snapshot(root)
    with pytest.raises(SystemExit) as e:
        run(root, *argv)
    assert snapshot(root) == before
    return str(e.value)


def test_deprecate_marks_plugin_and_cleans_references(root, capsys):
    retire_root(root)
    run(root, "deprecate", "uv-lock", "--into", "uv-new", "--reason", "folded in", "--date", "2026-03-04")
    prefix = "Deprecated: use uv-new. Locks deps."
    for rel in ("plugins/uv-lock/.claude-plugin/plugin.json", plugins.MARKETPLACE):
        data = read(root, rel)
        item = data if rel != plugins.MARKETPLACE else next(p for p in data["plugins"] if p["name"] == "uv-lock")
        assert item["description"] == prefix
        assert item["version"] == "0.1.1"
    assert read(root, "plugins/python-meta/.claude-plugin/plugin.json")["dependencies"] == ["uv-new"]
    entries = {p["name"]: p["version"] for p in read(root, plugins.MARKETPLACE)["plugins"]}
    assert entries == {"python-meta": "0.1.1", "uv-lock": "0.1.1", "uv-new": "0.1.0"}
    assert read(root, "plugins/python-meta/.claude-plugin/plugin.json")["version"] == "0.1.1"
    assert read(root, plugins.RETIRED) == {
        "deprecated": {"uv-lock": {"into": "uv-new", "reason": "folded in", "date": "2026-03-04"}}, "archived": {}}
    example = (root / "examples/claude-settings/settings.global.json").read_text()
    assert json.loads(example) == {
        "$schema": "https://json.schemastore.org/claude-code-settings.json",
        "enabledPlugins": {"uv-new@adminhead": True, "other@elsewhere": True}, "pluginConfigs": {}}
    assert '    "uv-new@adminhead": true,\n    "other@elsewhere": true\n  },' in example  # other lines untouched
    assert f"| {prefix} |" in (root / "README.md").read_text()
    assert plugins.check(root) == []
    out = capsys.readouterr().out
    for changed in ("plugins/uv-lock/.claude-plugin/plugin.json", "plugins/python-meta/.claude-plugin/plugin.json",
                    ".claude-plugin/marketplace.json", "scripts/retired.json", "README.md",
                    "examples/claude-settings/settings.global.json"):
        assert changed in out


def test_deprecate_edits_manifests_in_place(root):
    retire_root(root)
    path = root / "plugins/uv-lock/.claude-plugin/plugin.json"
    text = path.read_text().rstrip("\n").removesuffix("}")
    path.write_text(text.rstrip() + ',\n  "userConfig": {\n    "on": { "type": "boolean", "default": true }\n  }\n}\n')
    meta = root / "plugins/python-meta/.claude-plugin/plugin.json"
    meta_before = meta.read_text()
    plugins.write_catalog(root)
    before = path.read_text()
    run(root, "deprecate", "uv-lock", "--reason", "gone")
    after = path.read_text()
    assert after.endswith('  "userConfig": {\n    "on": { "type": "boolean", "default": true }\n  }\n}\n')
    assert [l for l in before.splitlines() if l not in after.splitlines()] == [
        '  "version": "0.1.0",', '  "description": "Locks deps.",']
    assert meta_before.replace('    "uv-lock",\n', "").replace("0.1.0", "0.1.1") == meta.read_text()


def test_deprecate_without_into_uses_plain_prefix(root):
    retire_root(root)
    run(root, "deprecate", "uv-lock", "--reason", "gone")
    assert read(root, "plugins/uv-lock/.claude-plugin/plugin.json")["description"] == "Deprecated. Locks deps."
    assert read(root, plugins.RETIRED)["deprecated"]["uv-lock"] == {
        "into": None, "reason": "gone", "date": plugins.today()}
    assert plugins.check(root) == []


def test_deprecate_does_not_double_the_prefix(root):
    retire_root(root)
    for path in (root / "plugins/uv-lock/.claude-plugin/plugin.json", root / plugins.MARKETPLACE):
        data = json.loads(path.read_text())
        item = data if "plugins" not in data else next(p for p in data["plugins"] if p["name"] == "uv-lock")
        item["description"] = "Deprecated. Locks deps."
        plugins.write_json(path, data)
    plugins.write_catalog(root)
    run(root, "deprecate", "uv-lock", "--reason", "gone")
    assert read(root, "plugins/uv-lock/.claude-plugin/plugin.json")["description"] == "Deprecated. Locks deps."
    assert plugins.check(root) == []


def test_deprecate_leaves_unrelated_example_files_untouched(root):
    retire_root(root)
    other = root / "examples/claude-settings/settings.project.json"
    other.write_text('{\n  "enabledPlugins": { "<plugin>@adminhead": true }\n}\n')
    run(root, "deprecate", "uv-lock", "--reason", "gone")
    assert other.read_text() == '{\n  "enabledPlugins": { "<plugin>@adminhead": true }\n}\n'


def test_deprecate_removes_a_bundle_member_from_bundles_and_metas(root):
    retire_root(root)
    add_bundle(root, "py-core", ["uv-lock"])
    set_deps(root, "python-meta", ["py-core", "uv-new"])
    plugins.write_catalog(root)
    run(root, "deprecate", "uv-lock", "--reason", "gone")
    assert read(root, "plugins/py-core/.claude-plugin/plugin.json")["dependencies"] == []
    assert read(root, "plugins/py-core/.claude-plugin/plugin.json")["version"] == "0.1.1"
    assert {p["name"]: p["version"] for p in read(root, plugins.MARKETPLACE)["plugins"]}["py-core"] == "0.1.1"
    assert plugins.check(root) == []


def test_deprecate_refusals(root):
    retire_root(root)
    assert "no such plugin" in refuses(root, "deprecate", "nope", "--reason", "x")
    assert "baseline" in refuses(root, "deprecate", "baseline", "--reason", "x")
    assert "--into" in refuses(root, "deprecate", "uv-lock", "--into", "nope", "--reason", "x")
    assert "--into" in refuses(root, "deprecate", "uv-lock", "--into", "uv-lock", "--reason", "x")
    assert "--date" in refuses(root, "deprecate", "uv-lock", "--reason", "x", "--date", "2026-13-40")
    assert "reason" in refuses(root, "deprecate", "uv-lock", "--reason", "  ")
    # a non-meta plugin that depends on it blocks the move
    add_plugin(root, "uv-user", ["uv-lock"])
    assert "uv-user" in refuses(root, "deprecate", "uv-lock", "--reason", "x")
    # a meta with dependents
    add_plugin(root, "needs-meta", ["python-meta"])
    assert "needs-meta" in refuses(root, "deprecate", "python-meta", "--reason", "x")
    # an --into target that is itself deprecated, and a repeat
    set_retired(root, deprecated={"uv-new": rec()})
    assert "retired" in refuses(root, "deprecate", "uv-lock", "--into", "uv-new", "--reason", "x")
    assert "already deprecated" in refuses(root, "deprecate", "uv-new", "--reason", "x")
    set_retired(root, archived={"uv-new": rec(archived="2026-02-02")})
    assert "already archived" in refuses(root, "deprecate", "uv-new", "--reason", "x")


def test_deprecate_refuses_before_writing_when_a_version_is_malformed(root):
    retire_root(root)
    set_deps(root, "python-meta", ["uv-lock", "uv-new"])
    path = root / "plugins/python-meta/.claude-plugin/plugin.json"
    manifest = json.loads(path.read_text())
    manifest["version"] = "next"
    plugins.write_json(path, manifest)
    before = (root / "plugins/uv-lock/.claude-plugin/plugin.json").read_bytes()
    assert "version" in refuses(root, "deprecate", "uv-lock", "--reason", "x")
    assert (root / "plugins/uv-lock/.claude-plugin/plugin.json").read_bytes() == before


def deprecated_root(root, into="uv-new"):
    retire_root(root)
    run(root, "deprecate", "uv-lock", "--into", into, "--reason", "folded in", "--date", "2026-03-04")
    return root


def test_archive_moves_the_plugin_and_updates_the_record(root, capsys):
    deprecated_root(root)
    assert run(root, "archive", "uv-lock", "--date", "2026-05-06") == 0
    assert not (root / "plugins/uv-lock").exists()
    assert (root / "archive/plugins/uv-lock/skills/uv-lock/SKILL.md").is_file()
    assert [p["name"] for p in read(root, plugins.MARKETPLACE)["plugins"]] == ["python-meta", "uv-new"]
    assert read(root, plugins.RETIRED) == {"deprecated": {}, "archived": {"uv-lock": {
        "into": "uv-new", "reason": "folded in", "date": "2026-03-04", "archived": "2026-05-06"}}}
    assert "uv-lock" not in (root / "README.md").read_text()
    assert plugins.check(root) == []
    assert "check: ok" in capsys.readouterr().out


def git_ok(root, *args):
    done = plugins.git(root, "-c", "user.name=t", "-c", "user.email=t@t", *args)
    assert done.returncode == 0, done.stderr
    return done.stdout


def test_archive_uses_git_mv_for_a_tracked_plugin(root):
    deprecated_root(root)
    git_ok(root, "init", "-q")
    git_ok(root, "add", "-A")
    git_ok(root, "commit", "-q", "-m", "x")
    assert run(root, "archive", "uv-lock") == 0
    status = git_ok(root, "status", "--porcelain")
    assert "R  plugins/uv-lock/.claude-plugin/plugin.json -> archive/plugins/uv-lock/.claude-plugin/plugin.json" in status


def test_archive_refusals(root):
    deprecated_root(root)
    assert "not deprecated" in refuses(root, "archive", "uv-new")
    assert "no such plugin" in refuses(root, "archive", "nope", "--force")
    (root / "archive/plugins/uv-lock").mkdir(parents=True)
    assert "already exists" in refuses(root, "archive", "uv-lock")
    (root / "archive/plugins/uv-lock").rmdir()
    add_plugin(root, "uv-user", ["uv-lock"])
    assert "uv-user" in refuses(root, "archive", "uv-lock")
    assert (root / "plugins/uv-lock").is_dir()


def test_archive_force_archives_an_undeprecated_plugin(root):
    retire_root(root)
    set_deps(root, "python-meta", ["uv-new"])
    (root / "examples/claude-settings/settings.global.json").unlink()
    assert run(root, "archive", "uv-lock", "--force", "--date", "2026-05-06") == 0
    record = read(root, plugins.RETIRED)["archived"]["uv-lock"]
    assert record["into"] is None and record["archived"] == "2026-05-06"
    assert (root / "archive/plugins/uv-lock").is_dir() and not (root / "plugins/uv-lock").exists()


def test_archive_reports_dangling_references_and_keeps_the_move(root, capsys):
    deprecated_root(root)
    run(root, "new", "uv-agent", "--kind", "agent", "--description", "Agent.")
    agent = root / "plugins/uv-agent/agents/uv-agent.md"
    agent.write_text(agent.read_text().replace("tools: Read", "skills: [uv-lock]\ntools: Read"))
    assert plugins.check(root) == []
    assert run(root, "archive", "uv-lock") == 1
    assert (root / "archive/plugins/uv-lock").is_dir()
    assert "uv-agent.md" in capsys.readouterr().err


def test_check_accepts_a_missing_retired_file(root):
    retire_root(root)
    assert not (root / plugins.RETIRED).exists()
    assert plugins.check(root) == []


@pytest.mark.parametrize("content", ['{"deprecated": []}', "not json", '{"surprise": {}}',
                                     '{"deprecated": {"a": {"into": null, "reason": "", "date": "2026-01-01"}}}',
                                     '{"deprecated": {"a": {"into": null, "reason": "x", "date": "01/02/2026"}}}',
                                     '{"deprecated": {"a": {"into": 3, "reason": "x", "date": "2026-01-01"}}}',
                                     '{"archived": {"a": {"into": null, "reason": "x", "date": "2026-01-01"}}}',
                                     '{"deprecated": {"a": {"into": null, "reason": "x", "date": "2026-01-01", "extra": 1}}}'])
def test_check_rejects_a_malformed_retired_file(root, content):
    (root / "scripts").mkdir()
    (root / plugins.RETIRED).write_text(content)
    assert any(e.startswith(str(plugins.RETIRED)) for e in plugins.check(root))


def retired_errors(root):
    return [e for e in plugins.check(root) if not e.startswith("README.md")]


def test_check_rules_for_deprecated_plugins(root):
    retire_root(root)
    set_retired(root, deprecated={"ghost": rec()})
    assert any("ghost" in e and "marketplace.json" in e for e in retired_errors(root))

    # recorded but not marked, still in a meta and in an example file
    set_retired(root, deprecated={"uv-lock": rec("uv-new")})
    errors = retired_errors(root)
    assert sum("description must start with" in e for e in errors) == 2
    assert any("python-meta" in e and "deprecated plugin uv-lock" in e for e in errors)
    assert any("settings.global.json" in e and "uv-lock" in e for e in errors)


def test_check_into_must_be_a_live_plugin(root):
    deprecated_root(root)
    assert plugins.check(root) == []
    for into in ("missing", "uv-lock"):
        set_retired(root, deprecated={"uv-lock": rec(into)})
        assert any("into" in e for e in retired_errors(root))
    # a deprecated plugin pointing at a plugin that was archived later
    set_retired(root, deprecated={"uv-lock": rec("uv-new")}, archived={"uv-new": rec(archived="2026-01-03")})
    assert any("into uv-new" in e for e in retired_errors(root))


def test_check_rules_for_archived_plugins(root):
    deprecated_root(root)
    run(root, "archive", "uv-lock")
    assert plugins.check(root) == []
    # restored to plugins/ and the marketplace: no longer archived
    shutil.copytree(root / "archive/plugins/uv-lock", root / "plugins/uv-lock")
    assert any("uv-lock" in e and "still in marketplace.json or plugins/" in e for e in plugins.check(root))
    shutil.rmtree(root / "plugins/uv-lock")
    shutil.rmtree(root / "archive/plugins/uv-lock")
    assert any("archive/plugins/uv-lock does not exist" in e for e in plugins.check(root))


# --- Review follow-ups: atomicity, check after deprecate, CRLF, guards ------

def test_deprecate_refuses_without_catalog_markers_and_changes_nothing(root):
    retire_root(root)
    (root / "README.md").write_text("# no markers\n")
    assert "markers" in refuses(root, "deprecate", "uv-lock", "--reason", "x")


def test_archive_refuses_without_catalog_markers_and_moves_nothing(root):
    deprecated_root(root)
    (root / "README.md").write_text("# no markers\n")
    assert "markers" in refuses(root, "archive", "uv-lock")
    assert (root / "plugins/uv-lock").is_dir() and not (root / "archive").exists()


def test_deprecate_refuses_an_unreadable_example_file_and_changes_nothing(root):
    retire_root(root)
    (root / "examples/claude-settings/settings.project.json").write_text("{ not json")
    assert "settings.project.json" in refuses(root, "deprecate", "uv-lock", "--reason", "x")


def test_check_reports_an_unreadable_example_file(root):
    retire_root(root)
    (root / "examples/claude-settings/settings.project.json").write_text("{ not json")
    assert any("settings.project.json" in e and "JSON" in e for e in plugins.check(root))
    (root / "examples/claude-settings/settings.project.json").write_text("[]")
    assert any("settings.project.json" in e for e in plugins.check(root))


def drift_suite(root, monkeypatch):
    """A root eval suite whose case lists every plugin of python-meta, as the real forges and jvm suites do."""
    monkeypatch.setitem(plugins.ROOT_SUITES, "suite", {"metas": ("python-meta",), "extra": (), "exclude": ()})
    case = root / "evals/suite/evals/c1"
    (case / "graders").mkdir(parents=True)
    (case / "prompt.md").write_text("---\nplugins:\n  - ../../../../plugins/uv-lock\n  - ../../../../plugins/uv-new\n---\nDo it.\n")
    (case / "graders/g.md").write_text("---\ntype: regex\npattern: done\n---\n")


def test_deprecate_runs_check_and_reports_a_drifting_eval_suite(root, monkeypatch, capsys):
    retire_root(root)
    drift_suite(root, monkeypatch)
    assert plugins.check(root) == []
    assert run(root, "deprecate", "uv-lock", "--reason", "gone") == 1
    err = capsys.readouterr().err
    assert "drifts from the suite closure" in err and "unexpected uv-lock" in err
    assert "deprecated" in read(root, plugins.RETIRED)  # the changes are kept
    assert "uv-lock" in read(root, plugins.RETIRED)["deprecated"]


def test_deprecate_returns_zero_when_check_is_clean(root, capsys):
    retire_root(root)
    assert run(root, "deprecate", "uv-lock", "--reason", "gone") == 0
    assert "check: ok" in capsys.readouterr().out


def crlf(path):
    path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))


def only_crlf(path):
    data = path.read_bytes()
    return b"\r\n" in data and b"\n" not in data.replace(b"\r\n", b"")


def test_deprecate_keeps_crlf_line_endings(root):
    retire_root(root)
    files = [root / "plugins/uv-lock/.claude-plugin/plugin.json", root / "plugins/python-meta/.claude-plugin/plugin.json",
             root / "examples/claude-settings/settings.global.json"]
    for f in files:
        crlf(f)
    assert run(root, "deprecate", "uv-lock", "--reason", "gone") == 0
    for f in files:
        assert only_crlf(f), f
    assert read(root, "plugins/python-meta/.claude-plugin/plugin.json")["dependencies"] == ["uv-new"]
    assert "uv-lock@adminhead" not in (root / "examples/claude-settings/settings.global.json").read_text()


def test_save_manifest_rewrites_whole_when_a_key_is_new_and_keeps_crlf(tmp_path):
    path = tmp_path / "plugin.json"
    path.write_bytes(b'{\r\n  "name": "x",\r\n  "meta": { "a": 1 }\r\n}\r\n')
    plugins.save_manifest(path, {"name": "x", "meta": {"a": 1}, "version": "0.1.1"})  # no version key to patch
    assert json.loads(path.read_text()) == {"name": "x", "meta": {"a": 1}, "version": "0.1.1"}
    assert only_crlf(path)
    assert '"a": 1\r\n  }' in path.read_bytes().decode()  # standard layout


def test_save_manifest_patches_only_the_changed_lines(tmp_path):
    path = tmp_path / "plugin.json"
    text = '{\n  "name": "x",\n  "version": "0.1.0",\n  "meta": { "a": 1 },\n  "dependencies": [\n    "a",\n    "b"\n  ]\n}\n'
    path.write_text(text)
    plugins.save_manifest(path, {"name": "x", "version": "0.1.1", "meta": {"a": 1}, "dependencies": ["b"]})
    assert path.read_text() == text.replace("0.1.0", "0.1.1").replace('    "a",\n', "")


def test_archive_force_refuses_baseline_and_live_metas(root):
    retire_root(root)
    add_plugin(root, "baseline", ["uv-new"])
    assert "baseline" in refuses(root, "archive", "baseline", "--force")
    assert "deprecated before" in refuses(root, "archive", "python-meta", "--force")
    add_bundle(root, "py-core", ["uv-new"])
    assert "deprecated before" in refuses(root, "archive", "py-core", "--force")
    assert (root / "plugins/python-meta").is_dir() and (root / "plugins/py-core").is_dir()


def test_archive_allows_a_deprecated_meta(root):
    retire_root(root)
    run(root, "deprecate", "python-meta", "--reason", "gone")
    assert run(root, "archive", "python-meta") == 0
    assert (root / "archive/plugins/python-meta").is_dir()


def test_archive_refuses_a_symlinked_plugin_directory(root, tmp_path_factory):
    deprecated_root(root)
    elsewhere = tmp_path_factory.mktemp("elsewhere") / "uv-lock"
    shutil.move(str(root / "plugins/uv-lock"), str(elsewhere))
    (root / "plugins/uv-lock").symlink_to(elsewhere, target_is_directory=True)
    assert "symlink" in refuses(root, "archive", "uv-lock")
    assert elsewhere.is_dir() and not (root / "archive").exists()


def test_archive_refuses_an_already_archived_plugin(root):
    deprecated_root(root)
    assert run(root, "archive", "uv-lock") == 0
    assert "already archived" in refuses(root, "archive", "uv-lock")
    assert "already archived" in refuses(root, "archive", "uv-lock", "--force")


def test_archive_refuses_when_the_destination_is_a_file(root):
    deprecated_root(root)
    (root / "archive/plugins").mkdir(parents=True)
    (root / "archive/plugins/uv-lock").write_text("in the way")
    assert "already exists" in refuses(root, "archive", "uv-lock")
    assert (root / "plugins/uv-lock").is_dir()
