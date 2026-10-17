#!/usr/bin/env python3
"""Scaffold, check, and catalog the plugins in this marketplace.

  plugins.py new <name> --kind skill|agent|hook|mcp --description TEXT [--meta META ...]
  plugins.py register [--meta META=PLUGIN,PLUGIN ...]
  plugins.py check
  plugins.py sync-shared
  plugins.py catalog [--check]

A meta plugin is `baseline` or a name ending in `-meta`. A core bundle is a
name ending in `-core` that several metas share. Both ship only a plugin.json
whose `dependencies` list the plugins they install. Every other plugin is a
leaf and ships exactly one component.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKETPLACE = Path(".claude-plugin/marketplace.json")
README = Path("README.md")
CATALOG_START = "<!-- catalog:start -->"
CATALOG_END = "<!-- catalog:end -->"
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
META_FILES = {".claude-plugin/plugin.json", "README.md"}
SHARED = Path("scripts/shared")
SHARED_FILES = ("shell/walk.ts", "vendor/unbash.js", "vendor/unbash.d.ts")
SCOPES = {"baseline": "user", "orchestration-meta": "user or project"}
KINDS = ("skill", "agent", "hook", "mcp")


def is_meta(name):
    return name == "baseline" or name.endswith("-meta")


def is_bundle(name):
    return name.endswith("-core")


def is_group(name):
    """True for plugins that ship only a dependency list."""
    return is_meta(name) or is_bundle(name)


def load_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def parse_dep(dep):
    """Return (name, marketplace or None) for a string or object dependency."""
    if isinstance(dep, str):
        name, _, market = dep.partition("@")
        return name, market or None
    return dep.get("name", ""), dep.get("marketplace")


def components(plugin_dir, manifest):
    """List (kind, label) for each component a plugin ships."""
    found = []
    for skill in sorted(plugin_dir.glob("skills/*/SKILL.md")):
        found.append(("skill", skill.parent.name))
    for kind, pattern in (("agent", "agents/*.md"), ("command", "commands/*.md"),
                          ("output-style", "output-styles/*.md")):
        for path in sorted(plugin_dir.glob(pattern)):
            found.append((kind, path.stem))
    hook_files = ["hooks/hooks.json"]
    extra = manifest.get("hooks")
    if isinstance(extra, str):
        hook_files.append(extra.removeprefix("./"))
    elif isinstance(extra, list):
        hook_files += [h.removeprefix("./") for h in extra if isinstance(h, str)]
    for rel in dict.fromkeys(hook_files):
        if (plugin_dir / rel).is_file():
            found.append(("hook", rel))
    for kind, key, file in (("mcp", "mcpServers", ".mcp.json"), ("lsp", "lspServers", ".lsp.json")):
        servers = dict(manifest.get(key) or {}) if isinstance(manifest.get(key), dict) else {}
        if (plugin_dir / file).is_file():
            data = load_json(plugin_dir / file)
            servers.update(data.get(key, data))
        found += [(kind, name) for name in servers]
    return found


def load_plugins(root):
    market = load_json(root / MARKETPLACE)
    entries = {e["name"]: e for e in market.get("plugins", [])}
    manifests = {}
    plugins_dir = root / "plugins"
    if plugins_dir.is_dir():
        for d in sorted(p for p in plugins_dir.iterdir() if p.is_dir()):
            mf = d / ".claude-plugin/plugin.json"
            manifests[d.name] = load_json(mf) if mf.is_file() else None
    return market, entries, manifests


def check(root):
    market, entries, manifests = load_plugins(root)
    allowed = set(market.get("allowCrossMarketplaceDependenciesOn", []))
    own = market.get("name")
    errors = []

    for name, entry in entries.items():
        if entry.get("source") != f"./plugins/{name}":
            errors.append(f"{name}: marketplace source should be ./plugins/{name}")
        if name not in manifests:
            errors.append(f"{name}: listed in marketplace.json but plugins/{name} is missing")
    for name, manifest in manifests.items():
        if name not in entries:
            errors.append(f"{name}: plugins/{name} has no marketplace.json entry")
        if manifest is None:
            errors.append(f"{name}: missing .claude-plugin/plugin.json")
            continue
        if not NAME_RE.match(name):
            errors.append(f"{name}: name must be lowercase kebab-case")
        if manifest.get("name") != name:
            errors.append(f"{name}: plugin.json name is {manifest.get('name')!r}")
        entry = entries.get(name, {})
        for field in ("version", "description"):
            if not manifest.get(field):
                errors.append(f"{name}: plugin.json has no {field}")
            elif entry and manifest.get(field) != entry.get(field):
                errors.append(f"{name}: {field} differs between plugin.json and marketplace.json")

        plugin_dir = root / "plugins" / name
        for dep in manifest.get("dependencies", []):
            dep_name, dep_market = parse_dep(dep)
            if dep_market and dep_market != own:
                if dep_market not in allowed:
                    errors.append(f"{name}: dependency {dep_name}@{dep_market} is not in allowCrossMarketplaceDependenciesOn")
            elif dep_name not in entries:
                errors.append(f"{name}: dependency {dep_name} is not in this marketplace")
            elif is_meta(dep_name):
                errors.append(f"{name}: depends on meta plugin {dep_name}; list its plugins instead")
            elif is_bundle(dep_name) and not is_meta(name):
                errors.append(f"{name}: only meta plugins may depend on core bundle {dep_name}")

        if is_group(name):
            kind = "meta plugin" if is_meta(name) else "core bundle"
            files = {p.relative_to(plugin_dir).as_posix() for p in plugin_dir.rglob("*") if p.is_file()}
            extra = sorted(files - META_FILES)
            if extra:
                errors.append(f"{name}: a {kind} ships only plugin.json, found {', '.join(extra)}")
        else:
            found = components(plugin_dir, manifest)
            if len(found) != 1:
                listed = ", ".join(f"{k} {l}" for k, l in found) or "none"
                errors.append(f"{name}: a plugin ships exactly one component, found {len(found)} ({listed})")

    if catalog_section(root, entries, manifests) not in (root / README).read_text():
        errors.append("README.md: plugin catalog is stale; run scripts/plugins.py catalog")
    if (root / SHARED).is_dir():
        for canonical, copy in shared_copies(root):
            if canonical.read_bytes() != copy.read_bytes():
                errors.append(f"{copy.relative_to(root)}: differs from {canonical.relative_to(root)}; run scripts/plugins.py sync-shared")
    return errors


def dep_labels(manifest):
    labels = []
    for dep in manifest.get("dependencies", []):
        dep_name, dep_market = parse_dep(dep)
        labels.append(f"`{dep_name}`" if not dep_market else f"`{dep_name}@{dep_market}`")
    return labels


def shared_copies(root):
    """Yield (canonical, copy) for each plugin copy of a file under scripts/shared."""
    for rel in SHARED_FILES:
        canonical = root / SHARED / rel
        for copy in sorted((root / "plugins").glob(f"*/*/{rel}")):
            yield canonical, copy


def sync_shared(root):
    changed = 0
    for canonical, copy in shared_copies(root):
        if canonical.read_bytes() != copy.read_bytes():
            copy.write_bytes(canonical.read_bytes())
            changed += 1
            print(f"updated {copy.relative_to(root)}")
    print(f"{changed} shared file(s) updated")


def catalog_section(root, entries, manifests):
    metas, bundles, leaves = [], [], []
    included_in = {}
    for name, manifest in manifests.items():
        if manifest and is_group(name):
            for dep in manifest.get("dependencies", []):
                dep_name, _ = parse_dep(dep)
                included_in.setdefault(dep_name, []).append(f"`{name}`")
    for name in entries:
        manifest = manifests.get(name) or {}
        link = f"[`{name}`](plugins/{name}{'/README.md' if (root / 'plugins' / name / 'README.md').is_file() else ''})"
        desc = entries[name].get("description", "")
        if is_meta(name):
            scope = SCOPES.get(name, "project")
            metas.append(f"| {link} | {scope} | {', '.join(dep_labels(manifest)) or 'none yet'} | {desc} |")
        elif is_bundle(name):
            used_by = ", ".join(included_in.get(name, [])) or "-"
            bundles.append(f"| {link} | {', '.join(dep_labels(manifest)) or 'none yet'} | {used_by} | {desc} |")
        else:
            found = components(root / "plugins" / name, manifest)
            kind = found[0][0] if len(found) == 1 else "invalid"
            leaves.append(f"| {link} | {kind} | {desc} | {', '.join(included_in.get(name, [])) or '-'} |")

    lines = [CATALOG_START, "", "### Meta plugins", ""]
    lines += ["| Plugin | Scope | Installs | Description |", "| --- | --- | --- | --- |", *metas] if metas else ["None yet."]
    if bundles:
        lines += ["", "### Core bundles", ""]
        lines += ["| Plugin | Installs | Used by | Description |", "| --- | --- | --- | --- |", *bundles]
    lines += ["", "### Plugins", ""]
    lines += ["| Plugin | Type | Description | In |", "| --- | --- | --- | --- |", *leaves] if leaves else ["None yet."]
    lines += ["", CATALOG_END]
    return "\n".join(lines)


def write_catalog(root):
    _, entries, manifests = load_plugins(root)
    readme = root / README
    text = readme.read_text()
    start, end = text.find(CATALOG_START), text.find(CATALOG_END)
    if start == -1 or end == -1:
        raise SystemExit(f"README.md needs {CATALOG_START} and {CATALOG_END} markers")
    new = text[:start] + catalog_section(root, entries, manifests) + text[end + len(CATALOG_END):]
    if new != text:
        readme.write_text(new)
        return True
    return False


def title(name):
    return name.replace("-", " ").capitalize()


def scaffold_files(name, kind, description):
    if kind == "skill":
        return {f"skills/{name}/SKILL.md": (
            f"---\nname: {name}\ndescription: {description} Use when TODO.\n---\n\n"
            f"# {title(name)}\n\nTODO\n")}
    if kind == "agent":
        return {f"agents/{name}.md": (
            f"---\nname: {name}\ndescription: {description} Use when TODO.\ntools: Read, Grep, Glob\n---\n\n"
            "TODO: the agent's system prompt and output contract.\n")}
    if kind == "hook":
        return {"hooks/hooks.json": {"description": description, "hooks": {}}}
    return {".mcp.json": {"mcpServers": {name: {"command": "TODO", "args": []}}}}


def new(root, name, kind, description, metas):
    if not NAME_RE.match(name):
        raise SystemExit(f"{name}: use lowercase kebab-case")
    if is_group(name):
        raise SystemExit(f"{name}: `baseline`, `*-meta` and `*-core` names are reserved for meta plugins and core bundles")
    plugin_dir = root / "plugins" / name
    if plugin_dir.exists():
        raise SystemExit(f"plugins/{name} already exists")
    market, entries, manifests = load_plugins(root)
    for meta in metas:
        if not is_group(meta) or manifests.get(meta) is None:
            raise SystemExit(f"{meta}: no such meta plugin or core bundle")

    author = market.get("owner", {})
    write_json(plugin_dir / ".claude-plugin/plugin.json",
               {"name": name, "version": "0.1.0", "description": description, "author": author})
    for rel, content in scaffold_files(name, kind, description).items():
        path = plugin_dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, str):
            path.write_text(content)
        else:
            write_json(path, content)

    market.setdefault("plugins", []).append({
        "name": name, "source": f"./plugins/{name}", "description": description,
        "version": "0.1.0", "category": "development"})
    write_json(root / MARKETPLACE, market)
    for meta in metas:
        path = root / "plugins" / meta / ".claude-plugin/plugin.json"
        manifest = load_json(path)
        manifest.setdefault("dependencies", []).append(name)
        write_json(path, manifest)
    write_catalog(root)
    print(f"Created plugins/{name} ({kind}). Fill in the TODOs, then run scripts/plugins.py check.")


def register(root, assignments):
    """Add marketplace entries for plugin dirs that lack one, then apply meta assignments."""
    market, entries, manifests = load_plugins(root)
    added = []
    for name, manifest in manifests.items():
        if name in entries or manifest is None:
            continue
        market.setdefault("plugins", []).append({
            "name": name, "source": f"./plugins/{name}", "description": manifest.get("description", ""),
            "version": manifest.get("version", "0.1.0"), "category": "meta" if is_group(name) else "development"})
        added.append(name)
    write_json(root / MARKETPLACE, market)
    for spec in assignments:
        group, _, members = spec.partition("=")
        if not is_group(group) or manifests.get(group) is None:
            raise SystemExit(f"{group}: no such meta plugin or core bundle")
        path = root / "plugins" / group / ".claude-plugin/plugin.json"
        manifest = load_json(path)
        deps = manifest.setdefault("dependencies", [])
        known = {parse_dep(d)[0] for d in deps}
        for member in filter(None, (m.strip() for m in members.split(","))):
            if member not in known:
                deps.append(member)
                known.add(member)
        write_json(path, manifest)
    write_catalog(root)
    print(f"registered {len(added)} plugin(s){': ' + ', '.join(added) if added else ''}")


def main(argv=None, root=ROOT):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_new = sub.add_parser("new", help="scaffold a one-component plugin")
    p_new.add_argument("name")
    p_new.add_argument("--kind", choices=KINDS, required=True)
    p_new.add_argument("--description", required=True)
    p_new.add_argument("--meta", action="append", default=[], help="meta plugin or core bundle to add it to (repeatable)")
    p_reg = sub.add_parser("register", help="add marketplace entries for unlisted plugin dirs")
    p_reg.add_argument("--meta", action="append", default=[], metavar="META=PLUGIN,PLUGIN",
                       help="also add these plugins to a meta plugin or core bundle (repeatable)")
    sub.add_parser("check", help="check structure rules and catalog freshness")
    sub.add_parser("sync-shared", help="copy scripts/shared files over their plugin copies")
    p_cat = sub.add_parser("catalog", help="regenerate the README plugin catalog")
    p_cat.add_argument("--check", action="store_true", help="exit 1 if the catalog is stale")
    args = parser.parse_args(argv)

    if args.cmd == "new":
        new(root, args.name, args.kind, args.description, args.meta)
    elif args.cmd == "register":
        register(root, args.meta)
    elif args.cmd == "sync-shared":
        sync_shared(root)
    elif args.cmd == "check":
        errors = check(root)
        for e in errors:
            print(e, file=sys.stderr)
        if errors:
            return 1
        print("ok")
    elif args.check:
        _, entries, manifests = load_plugins(root)
        if catalog_section(root, entries, manifests) not in (root / README).read_text():
            print("README.md: plugin catalog is stale", file=sys.stderr)
            return 1
    else:
        print("updated README.md" if write_catalog(root) else "README.md already current")
    return 0


if __name__ == "__main__":
    sys.exit(main())
