import json
import shutil
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
                              "description": "Python set.", "version": "0.1.0"})
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
    market["plugins"].append({"name": name, "source": f"./plugins/{name}", "description": "Core.", "version": "0.1.0"})
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


def test_new_rejects_core_names(root):
    with pytest.raises(SystemExit):
        run(root, "new", "web-core", "--kind", "skill", "--description", "x")


def test_register_lists_new_dirs_and_assigns_metas(root):
    plugins.write_json(root / "plugins/uv-lock/.claude-plugin/plugin.json",
                       {"name": "uv-lock", "version": "0.1.0", "description": "Locks deps."})
    skill = root / "plugins/uv-lock/skills/uv-lock/SKILL.md"
    skill.parent.mkdir(parents=True)
    skill.write_text("---\nname: uv-lock\n---\n")
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


def test_repo_passes_check():
    assert plugins.check(REPO) == []
