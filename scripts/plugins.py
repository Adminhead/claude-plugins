#!/usr/bin/env python3
"""Scaffold, check, and catalog the plugins in this marketplace.

  plugins.py new <name> --kind skill|agent|hook|mcp --description TEXT [--meta META ...]
  plugins.py register [--meta META=PLUGIN,PLUGIN ...]
  plugins.py check [--since REF]
  plugins.py sync-shared
  plugins.py upstream [PLUGIN ...] [--fetch]
  plugins.py catalog [--check]
  plugins.py deprecate <name> --reason TEXT [--into PLUGIN] [--date YYYY-MM-DD]
  plugins.py archive <name> [--force] [--date YYYY-MM-DD]

A meta plugin is `baseline` or a name ending in `-meta`. A core bundle is a
plugin whose marketplace entry has category "bundle" (named `*-core` by
convention) that several metas share. Both ship only a plugin.json whose
`dependencies` list the plugins they install. Every other plugin is a leaf and
ships exactly one component; a leaf may end in `-core` (`ef-core`).

Retire a plugin in two steps, never by hand. `deprecate` marks it (description prefix, patch bumps), drops it from
the metas, bundles and example settings that list it, and records it in scripts/retired.json. A release later,
`archive` moves it to archive/plugins/, removes its marketplace entry, and runs `check` to show dangling references.
scripts/install.mjs reads retired.json to warn users and, with --prune, to clean archived ids out of their settings.
"""

import argparse
import datetime
import json
import re
import shutil
import subprocess
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
SHARED_FILES = ("shell/walk.ts", "vendor/unbash.js", "vendor/unbash.d.ts", "log/usagelog.ts")
SCOPES = {"baseline": "user", "orchestration-meta": "user or project"}
KINDS = ("skill", "agent", "hook", "mcp")
# Leaves allowed more than one component, with the exact components they may ship.
# orchestration's SessionStart hook keeps ~/.local/bin/claude-orchestrate linked to the live install.
# scala ships its Metals LSP config; no adminhead or allowlisted marketplace has a Metals plugin (user decision 2026-10-20).
MULTI_COMPONENT = {
    "orchestration": {("agent", "orchestration"), ("hook", "hooks/hooks.json")},
    "scala": {("skill", "scala"), ("lsp", "metals")},
}
# Pairs of metas whose plugin sets must not overlap, except through baseline.
EXCLUSIVE_METAS = [("github-meta", "forgejo-meta")]


def is_meta(name):
    return name == "baseline" or name.endswith("-meta")


# Core bundles by name, from the marketplace entries with category "bundle"; set by load_plugins.
BUNDLES = set()


def is_bundle(name):
    return name in BUNDLES


def is_group(name):
    """True for plugins that ship only a dependency list."""
    return is_meta(name) or is_bundle(name)


def load_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
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
            data, _ = read_json(plugin_dir / file)  # a malformed file is reported by plugin_file_errors
            found_servers = data.get(key, data) if isinstance(data, dict) else None
            servers.update(found_servers if isinstance(found_servers, dict) else {})
        found += [(kind, name) for name in servers]
    return found


def load_plugins(root):
    market = load_json(root / MARKETPLACE)
    entries = {e["name"]: e for e in market.get("plugins", [])}
    BUNDLES.clear()
    BUNDLES.update(n for n, e in entries.items() if e.get("category") == "bundle")
    manifests = {}
    plugins_dir = root / "plugins"
    if plugins_dir.is_dir():
        for d in sorted(p for p in plugins_dir.iterdir() if p.is_dir()):
            mf = d / ".claude-plugin/plugin.json"
            manifests[d.name] = load_json(mf) if mf.is_file() else None
    return market, entries, manifests


def closure(name, manifests, own=None):
    """Return the set of plugins reachable from `name` through local dependencies, including itself.

    A dependency is local when its marketplace is unset or equals `own`, the marketplace's own name."""
    seen = set()
    stack = [name]
    while stack:
        current = stack.pop()
        if current in seen or current not in manifests:
            continue
        seen.add(current)
        for dep in (manifests[current] or {}).get("dependencies", []):
            dep_name, dep_market = parse_dep(dep)
            if not dep_market or dep_market == own:
                stack.append(dep_name)
    return seen


def exclusive_meta_errors(manifests, own=None):
    errors = []
    base = closure("baseline", manifests, own)
    for a, b in EXCLUSIVE_METAS:
        if a not in manifests or b not in manifests:
            continue
        shared = (closure(a, manifests, own) & closure(b, manifests, own)) - base - {a, b}
        if shared:
            errors.append(f"{a} and {b} must not share {', '.join(sorted(shared))}; scope them per forge")
    return errors


def check(root, since=None, warnings=None):
    """Return the list of errors. Warnings (optional checkouts, no node) are added to the `warnings` set."""
    yaml = require_yaml()
    warnings = set() if warnings is None else warnings
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
            multi = MULTI_COMPONENT.get(name)
            if multi is not None:
                if set(found) != multi:
                    listed = ", ".join(f"{k} {l}" for k, l in found) or "none"
                    want = ", ".join(f"{k} {l}" for k, l in sorted(multi))
                    errors.append(f"{name}: ships {listed}; MULTI_COMPONENT allows exactly {want}")
            elif len(found) != 1:
                listed = ", ".join(f"{k} {l}" for k, l in found) or "none"
                errors.append(f"{name}: a plugin ships exactly one component, found {len(found)} ({listed})")

    if catalog_section(root, entries, manifests) not in (root / README).read_text():
        errors.append("README.md: plugin catalog is stale; run scripts/plugins.py catalog")
    docs = Docs(yaml)
    skills = {}
    errors += component_doc_errors(root, manifests, docs, skills)
    errors += godot_version_errors(root, entries, manifests, docs)
    errors += agent_spawn_errors(root, docs)
    errors += category_errors(entries)
    errors += eval_errors(root, entries, manifests, docs, skills, own, warnings)
    errors += exclusive_meta_errors(manifests, own)
    errors += duplicate_entry_errors(market)
    errors += example_settings_errors(root, entries, own)
    errors += agent_frontmatter_errors(root, docs, skills)
    errors += plugin_file_errors(root, manifests)
    errors += skill_link_errors(root)
    errors += archive_reference_errors(root)
    errors += retired_errors(root, entries, manifests, own)
    if (root / SHARED).is_dir():
        for canonical, copy in shared_copies(root):
            if canonical.read_bytes() != copy.read_bytes():
                errors.append(f"{copy.relative_to(root)}: differs from {canonical.relative_to(root)}; run scripts/plugins.py sync-shared")
    if since:
        errors += since_errors(root, since)
    return errors


def dep_labels(manifest):
    labels = []
    for dep in manifest.get("dependencies", []):
        dep_name, dep_market = parse_dep(dep)
        labels.append(f"`{dep_name}`" if not dep_market else f"`{dep_name}@{dep_market}`")
    return labels


# The only agent allowed to start other agents: it runs as the main thread.
MAIN_THREAD_AGENTS = {"orchestration"}
SPAWN_TOOLS = ("Agent", "Task", "Workflow")


# --- Frontmatter -------------------------------------------------------------

YAML_HINT = "PyYAML is required: pip install pyyaml, or run: uv run --with pyyaml python3 scripts/plugins.py check"


def require_yaml():
    try:
        import yaml
    except ImportError:
        print(YAML_HINT, file=sys.stderr)
        raise SystemExit(2)
    return yaml


def strict_loader(yaml):
    """A SafeLoader that rejects duplicate mapping keys."""
    class Strict(yaml.SafeLoader):
        pass

    def mapping(loader, node, deep=False):
        seen = set()
        for key_node, _ in node.value:
            key = loader.construct_object(key_node, deep=True)
            try:
                hash(key)
            except TypeError:
                continue
            if key in seen:
                raise yaml.constructor.ConstructorError(
                    None, None, f"duplicate key {key!r}", key_node.start_mark)
            seen.add(key)
        return yaml.SafeLoader.construct_mapping(loader, node, deep)

    Strict.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)
    return Strict


class Docs:
    """Parsed YAML frontmatter and case.yaml files, cached per path for one check run."""

    def __init__(self, yaml):
        self.yaml = yaml
        self.loader = strict_loader(yaml)
        self.cache = {}

    def load_yaml(self, text, offset=0):
        """Return (data, error) for a YAML document; `offset` is added to reported line numbers."""
        try:
            return self.yaml.load(text, Loader=self.loader), None
        except self.yaml.YAMLError as e:
            problem = getattr(e, "problem", None) or str(e).splitlines()[0]
            mark = getattr(e, "problem_mark", None) or getattr(e, "context_mark", None)
            where = f", line {mark.line + 1 + offset}" if mark else ""
            return None, f"invalid YAML ({problem}{where})"

    def md(self, path):
        """Return (data, body, error) for a Markdown file with frontmatter. data is None on any error."""
        if path not in self.cache:
            self.cache[path] = self._md(path)
        return self.cache[path]

    def _md(self, path):
        text = path.read_text(errors="replace")
        start = re.match(r"---[ \t]*\r?\n", text)
        if not start:
            return None, text, "no YAML frontmatter"
        rest = text[start.end():]
        end = re.search(r"^---[ \t]*\r?$", rest, re.M)
        if not end:
            return None, text, "frontmatter is not closed with ---"
        data, err = self.load_yaml(rest[:end.start()], offset=1)
        body = rest[end.end():].lstrip("\r\n")
        if err:
            return None, body, err
        if not isinstance(data, dict):
            return None, body, "frontmatter must be a mapping"
        return data, body, None

    def yaml_file(self, path):
        if path not in self.cache:
            data, err = self.load_yaml(path.read_text(errors="replace"))
            if err is None and not isinstance(data, dict):
                data, err = None, "case.yaml must be a mapping"
            self.cache[path] = (data, "", err)
        return self.cache[path]


NAME_FM_RE = re.compile(r"^[a-z0-9-]{1,64}$")
DESCRIPTION_MAX = 1024


def as_text(value):
    """A frontmatter list-or-string field as one comma-separated string."""
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return "" if value is None else str(value)


def component_doc_errors(root, manifests, docs, skills):
    """Parse every SKILL.md, agent and command; check name, description and agent-only fields.

    Fills `skills` with {(plugin, skill): data} for the eval target rules."""
    errors = []
    for plugin, manifest in manifests.items():
        if manifest is None:
            continue
        pdir = root / "plugins" / plugin
        files = [(f, f.parent.name, "skill") for f in sorted(pdir.glob("skills/*/SKILL.md"))]
        files += [(f, f.stem, "agent") for f in sorted(pdir.glob("agents/*.md"))]
        files += [(f, f.stem, "command") for f in sorted(pdir.glob("commands/*.md"))]
        for f, ident, kind in files:
            rel = f.relative_to(root)
            data, _, err = docs.md(f)
            if err:
                if kind != "command" or err != "no YAML frontmatter":
                    errors.append(f"{rel}: {err}")
                if kind == "skill":
                    skills[(plugin, ident)] = {}  # still a skill, so eval graders aimed at it resolve
                continue
            name = data.get("name")
            if kind != "command":
                if not isinstance(name, str) or not name:
                    errors.append(f"{rel}: frontmatter has no name")
                elif name != ident:
                    errors.append(f"{rel}: name {name!r} must equal {ident!r}")
                elif not NAME_FM_RE.match(name):
                    errors.append(f"{rel}: name {name!r} must match [a-z0-9-]{{1,64}}")
            desc = data.get("description")
            if desc is None and kind == "command":
                pass
            elif not isinstance(desc, str) or not desc.strip():
                errors.append(f"{rel}: description must be a non-empty string")
            elif len(desc) > DESCRIPTION_MAX:
                errors.append(f"{rel}: description is {len(desc)} chars, the limit is {DESCRIPTION_MAX}")
            if kind == "agent" and "autoCompactWindow" in data:
                errors.append(f"{rel}: agents inherit the session window; remove autoCompactWindow")
            if kind == "skill":
                skills[(plugin, ident)] = data
    return errors


def agent_spawn_errors(root, docs):
    """Subagents must not start agents: no Agent/Task/Workflow in `tools`, or all denied in `disallowedTools`."""
    errors = []
    for f in sorted((root / "plugins").glob("*/agents/*.md")):
        data, _, _ = docs.md(f)
        if data is None or str(data.get("name", f.stem)) in MAIN_THREAD_AGENTS:
            continue
        tools, denied = data.get("tools"), as_text(data.get("disallowedTools"))
        listed = lambda line, tool: re.search(rf"(^|[,\s]){tool}($|[,\s(])", line) is not None
        rel = f.relative_to(root)
        if tools is not None:
            bad = [t for t in SPAWN_TOOLS if listed(as_text(tools), t)]
            if bad:
                errors.append(f"{rel}: a subagent must not list {', '.join(bad)} in tools")
        else:
            missing = [t for t in ("Agent", "Workflow") if not listed(denied, t)]
            if missing:
                errors.append(f"{rel}: without a tools allowlist, disallowedTools must include {', '.join(missing)}")
    return errors


GODOT_MINOR = re.compile(r"\b4\.\d+")


def godot_version_errors(root, entries, manifests, docs):
    """Godot plugin descriptions say only "Godot 4"; minor versions live in bodies and version-notes.md."""
    errors = []
    for name, manifest in manifests.items():
        if not (name == "godot" or name.startswith("godot-")) or manifest is None or is_group(name):
            continue
        texts = {"plugin.json": manifest.get("description", "")}
        for skill in (root / "plugins" / name).glob("skills/*/SKILL.md"):
            data, _, _ = docs.md(skill)
            if data is not None and isinstance(data.get("description"), str):
                texts[skill.relative_to(root / "plugins" / name).as_posix()] = data["description"]
        for where, text in texts.items():
            if GODOT_MINOR.search(text):
                errors.append(f"{name}: {where} description names a Godot minor version; say \"Godot 4\"")
    return errors


# --- Marketplace categories --------------------------------------------------

CATEGORIES = ("development", "meta", "bundle")


def category_errors(entries):
    errors = []
    for name, entry in entries.items():
        cat = entry.get("category")
        if cat not in CATEGORIES:
            errors.append(f"{name}: marketplace category {cat!r} must be one of {', '.join(CATEGORIES)}")
        elif (cat == "meta") != is_meta(name):
            want = "meta" if is_meta(name) else "development or bundle"
            errors.append(f"{name}: marketplace category is {cat!r}; it must be {want}")
    return errors


# --- Eval cases --------------------------------------------------------------

# Skills that live outside this marketplace. An entry ending in `:*` is a plugin whose skill names are not listed here;
# a regex naming that plugin counts as aimed at it.
# codebase-memory is the user-level skill that ships with the codebase-memory MCP server; the coder-tier agents preload it.
EXTERNAL_SKILLS = ("gradle-skills:*", "android-skills:*", "create-skill", "skill-creator", "codebase-memory")


# --- References between files ------------------------------------------------
# Rules that keep a removal safe: a plugin that is renamed, deprecated or archived must leave no dangling pointer.

def read_json(path):
    """Return (data, error) for a JSON file."""
    try:
        return load_json(path), None
    except (ValueError, OSError) as e:
        return None, f"invalid JSON ({e})"


def duplicate_entry_errors(market):
    errors, seen = [], set()
    for entry in market.get("plugins", []):
        name = entry.get("name")
        if name in seen:
            errors.append(f"{name}: listed more than once in marketplace.json plugins")
        seen.add(name)
    return errors


EXAMPLE_SETTINGS = Path("examples/claude-settings")


def example_settings_errors(root, entries, own):
    """Every `<plugin>@<this marketplace>` id in an example settings file names a marketplace entry.

    `<plugin>`-style placeholders and ids from other marketplaces are skipped. scripts/install.mjs installs the
    `enabledPlugins` ids of settings.global.json and aborts on one that does not exist."""
    errors = []
    suffix = f"@{own}"
    for f in sorted((root / EXAMPLE_SETTINGS).glob("*.json")) if own else []:
        rel = f.relative_to(root)
        data, err = read_json(f)
        if err or not isinstance(data, dict):
            errors.append(f"{rel}: {err or 'settings must be a JSON object'}")
            continue
        for key in ("enabledPlugins", "pluginConfigs"):
            section = data.get(key)
            for plugin_id in section if isinstance(section, dict) else ():
                name = plugin_id[:-len(suffix)]
                if plugin_id.endswith(suffix) and "<" not in name and name not in entries:
                    errors.append(f"{rel}: {key} id {plugin_id} is not a plugin in marketplace.json")
    return errors


MODEL_ALIASES = ("sonnet", "opus", "haiku", "fable", "inherit")
# `claude-opus-5-5`, optionally with a provider prefix (`us.anthropic.claude-...`) or a `[1m]` suffix.
MODEL_ID_RE = re.compile(r"^(?:[a-z0-9.-]+\.)?claude-[a-z0-9][a-z0-9._-]*(?::\d+)?(?:\[1m\])?$")


def model_ok(model):
    return isinstance(model, str) and (model.removesuffix("[1m]") in MODEL_ALIASES or MODEL_ID_RE.match(model) is not None)


def skill_ref_ok(ref, skills):
    """A preload resolves as `skill` or `plugin:skill` to a marketplace skill, or names an external skill."""
    if any(ref == skill or ref == f"{plugin}:{skill}" for plugin, skill in skills):
        return True
    return any(ref == e or (e.endswith(":*") and ref.startswith(e[:-1])) for e in EXTERNAL_SKILLS)


def agent_frontmatter_errors(root, docs, skills):
    """Agent `skills`, `model` and `tools` values Claude Code would reject or silently drop.

    `skills` is the index component_doc_errors fills. Whether a preloaded skill's plugin is a declared dependency
    is deliberately not checked."""
    errors = []
    for f in sorted((root / "plugins").glob("*/agents/*.md")):
        data, _, _ = docs.md(f)
        if data is None:
            continue
        rel = f.relative_to(root)
        if "skills" in data:
            refs = data["skills"]
            refs = re.split(r"[,\s]+", refs.strip()) if isinstance(refs, str) else refs
            if not isinstance(refs, list):
                errors.append(f"{rel}: skills must be a list of skill names")
            for ref in refs if isinstance(refs, list) else ():
                if not isinstance(ref, str) or not skill_ref_ok(ref, skills):
                    errors.append(f"{rel}: skills entry {ref!r} is not a skill in this marketplace or in EXTERNAL_SKILLS")
        if "model" in data and not model_ok(data["model"]):
            errors.append(f"{rel}: model {data['model']!r} must be {', '.join(MODEL_ALIASES)} or a full claude-* model id")
        if "tools" in data:
            tools = data["tools"]
            items = tools if isinstance(tools, list) else [tools]
            if not items or not all(isinstance(t, str) and t.strip() for t in items):
                errors.append(f"{rel}: tools must be a non-empty string or list of tool names")
    return errors


PLUGIN_ROOT_REF = re.compile(r"\$(?:\{CLAUDE_PLUGIN_ROOT\}|CLAUDE_PLUGIN_ROOT)/([^\s\"'`$|;&<>()*?\[\]{}]+)")


def strings_in(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for v in value:
            yield from strings_in(v)
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings_in(v)


def plugin_root_ref_errors(rel, pdir, value):
    """`${CLAUDE_PLUGIN_ROOT}/<path>` inside a hook or server definition must name a file in the plugin."""
    errors = []
    for text in strings_in(value):
        for m in PLUGIN_ROOT_REF.finditer(text):
            if not (pdir / m.group(1)).exists():
                errors.append(f"{rel}: ${{CLAUDE_PLUGIN_ROOT}}/{m.group(1)} does not exist")
    return errors


def hooks_file_errors(root, pdir):
    f = pdir / "hooks/hooks.json"
    rel = f.relative_to(root)
    data, err = read_json(f)
    if err or not isinstance(data, dict):
        return [f"{rel}: {err or 'must be a JSON object'}"]
    if "hooks" not in data and "modules" not in data:
        return [f"{rel}: needs a \"hooks\" object and/or a \"modules\" list; a bare event map fails to load"]
    errors = []
    hooks = data.get("hooks", {})
    if not isinstance(hooks, dict):
        errors.append(f"{rel}: \"hooks\" must be an object keyed by event")
        hooks = {}
    for event, groups in hooks.items():
        handlers = []
        if not isinstance(groups, list) or not all(isinstance(g, dict) and isinstance(g.get("hooks"), list) for g in groups):
            errors.append(f"{rel}: hooks.{event} must be a list of {{\"hooks\": [...]}} groups")
            continue
        for g in groups:
            handlers += g["hooks"]
        for h in handlers:
            if not isinstance(h, dict) or not isinstance(h.get("type"), str):
                errors.append(f"{rel}: hooks.{event} has a handler without a string type")
            elif h["type"] == "command" and not (isinstance(h.get("command"), str) and h["command"].strip()):
                errors.append(f"{rel}: hooks.{event} command handler has no command")
    errors += plugin_root_ref_errors(rel, pdir, hooks)
    modules = data.get("modules", [])
    if not isinstance(modules, list) or not all(isinstance(m, str) for m in modules):
        errors.append(f"{rel}: \"modules\" must be a list of file paths")
        modules = []
    for module in modules:
        # Paths are relative to hooks/, the directory of hooks.json; ${CLAUDE_PLUGIN_ROOT}/ anchors at the plugin root.
        target = pdir / module.removeprefix("${CLAUDE_PLUGIN_ROOT}/") if module.startswith("${") else f.parent / module
        if not (pdir.resolve() in target.resolve().parents and target.is_file()):
            errors.append(f"{rel}: module {module} is not a file inside the plugin")
    return errors


def mcp_file_errors(root, pdir):
    f = pdir / ".mcp.json"
    rel = f.relative_to(root)
    data, err = read_json(f)
    if err or not isinstance(data, dict):
        return [f"{rel}: {err or 'must be a JSON object'}"]
    servers = data.get("mcpServers")
    if not isinstance(servers, dict):
        return [f"{rel}: the top level must be {{\"mcpServers\": {{...}}}}; a bare server map is not the plugin format"]
    errors = []
    for name, server in servers.items():
        if not isinstance(server, dict) or not any(isinstance(server.get(k), str) and server[k] for k in ("command", "url")):
            errors.append(f"{rel}: server {name!r} needs a command or a url")
    return errors + plugin_root_ref_errors(rel, pdir, servers)


def plugin_file_errors(root, manifests):
    """`hooks/hooks.json` and `.mcp.json` parse, have the shape Claude Code loads, and point at files that exist."""
    errors = []
    for name, manifest in manifests.items():
        pdir = root / "plugins" / name
        if manifest is None:
            continue
        if (pdir / "hooks/hooks.json").is_file():
            errors += hooks_file_errors(root, pdir)
        if (pdir / ".mcp.json").is_file():
            errors += mcp_file_errors(root, pdir)
    return errors


# A relative path into one of a skill's own directories, ending in a file extension. Spaces, globs, `<placeholders>`
# and `${vars}` never match, so only a concrete path is checked.
SKILL_PATH = r"(?:\./)?(?:references|scripts|templates|assets)/[^\s)`'\"<>#?*{}$\[\]]*\.[A-Za-z0-9]+"
SKILL_LINK_RE = re.compile(rf"\]\(\s*({SKILL_PATH})(?:#[^)\s]*)?\s*\)|`({SKILL_PATH})`")
# A backticked path right after "`other-skill` ", "the plugin's " or "its " belongs to another skill.
OTHER_OWNER_RE = re.compile(r"(?:'s|\bits|`)\s+$")


def skill_link_errors(root):
    """Markdown links and backticked `references/x.md`-style paths in a SKILL.md must exist next to it.

    A backticked path is checked only when the skill ships that top-level directory and the text does not hand
    the path to another skill; prose also names files in a user's project and in this repo."""
    errors = []
    for f in sorted((root / "plugins").glob("*/skills/*/SKILL.md")):
        fenced = False
        for n, line in enumerate(f.read_text(errors="replace").splitlines(), 1):
            if line.lstrip().startswith(("```", "~~~")):
                fenced = not fenced
            elif not fenced:
                for m in SKILL_LINK_RE.finditer(line):
                    ref = m.group(1) or m.group(2)
                    if m.group(2) and (OTHER_OWNER_RE.search(line[:m.start()])
                                       or not (f.parent / ref.removeprefix("./").split("/")[0]).is_dir()):
                        continue
                    if not (f.parent / ref).exists():
                        errors.append(f"{f.relative_to(root)}:{n}: {ref} does not exist")
    return errors


ARCHIVE_REF_RE = re.compile(r"archive/plugins/([A-Za-z0-9][A-Za-z0-9._-]*)")
LIVE_PATHS = ("plugins", ".claude/skills", "CLAUDE.md", "examples")
SKIP_DIRS = {"node_modules", ".git"}


def live_files(root):
    for entry in LIVE_PATHS:
        base = root / entry
        if base.is_file():
            yield base
        for f in sorted(base.rglob("*")) if base.is_dir() else ():
            if f.is_file() and not SKIP_DIRS & set(f.relative_to(root).parts):
                yield f


def archive_reference_errors(root):
    """Live files must not point at `archive/plugins/<name>` for a name that is not archived."""
    errors = []
    for f in live_files(root):
        raw = f.read_bytes()
        if b"\0" in raw[:4096]:
            continue
        for n, line in enumerate(raw.decode(errors="replace").splitlines(), 1):
            for m in ARCHIVE_REF_RE.finditer(line):
                name = m.group(1).rstrip(".")
                if not (root / "archive/plugins" / name).is_dir():
                    errors.append(f"{f.relative_to(root)}:{n}: archive/plugins/{name} does not exist")
    return errors

# --- Retired plugins ---------------------------------------------------------
# scripts/retired.json is the one record of a retirement: `deprecate` writes `deprecated`, `archive` moves the
# record to `archived`. A missing file means nothing is retired.

RETIRED = Path("scripts/retired.json")
ARCHIVE = Path("archive/plugins")
RECORD_KEYS = {"into", "reason", "date"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def valid_date(value):
    if not (isinstance(value, str) and DATE_RE.match(value)):
        return False
    try:
        datetime.date.fromisoformat(value)
    except ValueError:
        return False
    return True


def read_retired(root):
    """Return (tables, errors) for scripts/retired.json; tables is {"deprecated": {...}, "archived": {...}}."""
    tables = {"deprecated": {}, "archived": {}}
    path = root / RETIRED
    if not path.is_file():
        return tables, []
    data, err = read_json(path)
    if err or not isinstance(data, dict):
        return tables, [f"{RETIRED}: {err or 'must be a JSON object'}"]
    errors = [f"{RETIRED}: unknown key {k!r}" for k in sorted(map(str, set(data) - set(tables)))]
    for table in tables:
        section = data.get(table, {})
        if not isinstance(section, dict):
            errors.append(f"{RETIRED}: {table} must be an object keyed by plugin name")
            continue
        allowed = RECORD_KEYS | ({"archived"} if table == "archived" else set())
        for name, rec in section.items():
            where = f"{RETIRED}: {table}.{name}"
            if not isinstance(rec, dict):
                errors.append(f"{where} must be an object")
                continue
            errors += [f"{where}: unknown key {k!r}" for k in sorted(map(str, set(rec) - allowed))]
            if not (rec.get("into") is None or isinstance(rec["into"], str) and rec["into"]):
                errors.append(f"{where}: into must be a plugin name or null")
            if not (isinstance(rec.get("reason"), str) and rec["reason"].strip()):
                errors.append(f"{where}: reason must be a non-empty string")
            for key in ("date", "archived") if table == "archived" else ("date",):
                if not valid_date(rec.get(key)):
                    errors.append(f"{where}: {key} must be a YYYY-MM-DD date")
        tables[table] = section
    errors += [f"{RETIRED}: {n} is both deprecated and archived" for n in sorted(set(tables["deprecated"]) & set(tables["archived"]))]
    return tables, errors


def load_retired(root):
    tables, errors = read_retired(root)
    if errors:
        raise SystemExit("\n".join(errors))
    return tables


def write_retired(root, tables):
    write_json(root / RETIRED, tables)


def deprecation_prefix(into):
    return f"Deprecated: use {into}. " if into else "Deprecated. "


def example_ids(root, own):
    """Yield (file, section, plugin name) for each `<plugin>@<this marketplace>` id in an example's enabledPlugins and pluginConfigs."""
    suffix = f"@{own}"
    for f in sorted((root / EXAMPLE_SETTINGS).glob("*.json")) if own else []:
        data, err = read_json(f)
        for key in ("enabledPlugins", "pluginConfigs"):
            section = data.get(key) if not err and isinstance(data, dict) else None
            for plugin_id in section if isinstance(section, dict) else ():
                if plugin_id.endswith(suffix):
                    yield f, key, plugin_id[:-len(suffix)]


def dependents(name, manifests, own):
    """Plugins whose dependencies list `name` from this marketplace."""
    found = []
    for other, manifest in manifests.items():
        for dep in (manifest or {}).get("dependencies", []):
            dep_name, dep_market = parse_dep(dep)
            if other != name and dep_name == name and (not dep_market or dep_market == own):
                found.append(other)
                break
    return sorted(found)


def retired_errors(root, entries, manifests, own):
    """retired.json parses; deprecated plugins are marked and unreferenced; archived ones are gone from plugins/."""
    tables, errors = read_retired(root)
    for table in ("deprecated", "archived"):
        for name, rec in tables[table].items():
            target = rec.get("into") if isinstance(rec, dict) else None
            if target and (target not in entries or target in tables["deprecated"] or target in tables["archived"]):
                errors.append(f"{RETIRED}: {table}.{name} into {target} must be a live plugin, not a missing, deprecated or archived one")
    for name, rec in tables["deprecated"].items():
        if not isinstance(rec, dict):
            continue
        if name not in entries:
            errors.append(f"{name}: deprecated in {RETIRED} but not listed in marketplace.json")
            continue
        want = deprecation_prefix(rec.get("into"))
        if not entries[name].get("description", "").startswith(want):
            errors.append(f"{name}: deprecated, so the marketplace.json description must start with {want.strip()!r}")
        manifest = manifests.get(name) or {}
        if manifest and not manifest.get("description", "").startswith(want):
            errors.append(f"{name}: deprecated, so the plugin.json description must start with {want.strip()!r}")
        for other in dependents(name, manifests, own):
            errors.append(f"{other}: depends on deprecated plugin {name}; remove the dependency")
    for f, key, name in example_ids(root, own):
        if name in tables["deprecated"]:
            errors.append(f"{f.relative_to(root)}: {key} still names deprecated plugin {name}")
    for name in tables["archived"]:
        if name in entries or name in manifests:
            errors.append(f"{name}: archived in {RETIRED} but still in marketplace.json or plugins/")
        if not (root / ARCHIVE / name).is_dir():
            errors.append(f"{name}: archived in {RETIRED} but {ARCHIVE}/{name} does not exist")
    return errors


# Root suites that load the plugins of whole metas: expected plugins = closure of the metas, minus meta and bundle
# plugins, minus `exclude`, plus `extra`. `3rd-party/<dir>` names an external checkout.
ROOT_SUITES = {
    "forges": {"metas": ("github-meta", "forgejo-meta"),
               "extra": ("forgejo-release", "gh-release", "git-commit"), "exclude": ()},
    "godot-meta": {"metas": ("godot-meta",), "extra": (), "exclude": ("grep-app",)},
    "jvm": {"metas": ("java-meta", "scala-meta"),
            "extra": ("play-framework", "spring-boot", "spring-boot-testing", "3rd-party/gradle-skills"),
            "exclude": ("grep-app", "context7")},
    "android": {"metas": ("android-meta", "kotlin-meta"),
                "extra": ("android-performance", "play-publishing", "java", "spring-boot-testing",
                          "3rd-party/gradle-skills", "3rd-party/android-skills"),
                "exclude": ("grep-app", "context7")},
}

PROMPT_KEYS = {"schema_version", "name", "description", "tags", "plugins", "runs", "expected_outcome", "model",
               "max_turns", "timeout_seconds", "allowed_tools", "append_system_prompt", "env"}
CASE_KEYS = {"schema_version", "name", "description", "tags", "plugins", "runs", "expected_outcome",
             "execution", "context", "graders"}
EXECUTION_KEYS = {"model", "max_turns", "timeout_seconds", "allowed_tools", "append_system_prompt", "env", "prompt"}
CONTEXT_KEYS = {"scaffold_script", "history_file", "add_dirs"}
GRADER_COMMON = {"type", "weight", "arm"}
GRADER_KEYS = {
    "regex": {"pattern", "flags", "match", "target"},
    "tool_used": {"tool", "input_match", "min", "max"},
    "tool_order": {"before", "after"},
    "file_exists": {"path", "exists"},
    "llm": {"criteria", "focus"},
    "baseline": {"baseline_file", "criteria"},
}
GRADER_REQUIRED = {"regex": ("pattern",), "tool_used": ("tool",), "tool_order": ("before", "after"),
                   "file_exists": ("path",), "baseline": ("baseline_file",)}
TARGETS = ("last_message", "trace", "files", "mock_calls")
MATCH_RE = re.compile(r"^(contains|not_contains|count:\d+)$")
INLINE_FLAGS_RE = re.compile(r"\(\?[a-zA-Z-]+[:)]")
ENV_KEY_RE = re.compile(r"^EVAL_[A-Z0-9_]*$")


def is_int(value, low=0, high=None):
    return isinstance(value, int) and not isinstance(value, bool) and value >= low and (high is None or value <= high)


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def check_keys(where, data, allowed, errors, label=""):
    for key in sorted(map(str, set(data) - allowed)):
        errors.append(f"{where}: unknown {label}key {key!r}")


def case_dirs(root):
    """Yield (case_dir, enclosing plugin or None, root suite or None) for every eval case."""
    bases = [(b, b.parent.name, None) for b in sorted((root / "plugins").glob("*/evals"))]
    bases += [(b, None, b.parent.name) for b in sorted((root / "evals").glob("*/evals"))]
    for base, plugin, suite in bases:
        for d in sorted(p for p in base.rglob("*") if p.is_dir()):
            if "results" in d.relative_to(base).parts:
                continue
            if (d / "prompt.md").is_file() or (d / "case.yaml").is_file():
                yield d, plugin, suite


def grader_schema_errors(where, g, errors):
    """Check one grader mapping (type, common keys, per-type keys and values)."""
    gtype = g.get("type")
    if gtype not in GRADER_KEYS:
        errors.append(f"{where}: grader type {gtype!r} must be one of {', '.join(GRADER_KEYS)}")
        return False
    check_keys(where, g, GRADER_COMMON | GRADER_KEYS[gtype] | {"name"}, errors, f"{gtype} grader ")
    for key in GRADER_REQUIRED.get(gtype, ()):
        if g.get(key) in (None, ""):
            errors.append(f"{where}: {gtype} grader needs {key}")
    if "weight" in g and not (is_number(g["weight"]) and g["weight"] > 0):
        errors.append(f"{where}: weight must be a positive number")
    if "arm" in g and g["arm"] not in ("with-only", "both"):
        errors.append(f"{where}: arm must be with-only or both")
    if gtype in ("regex", "llm"):
        target = g.get("target" if gtype == "regex" else "focus")
        if target is not None and target not in TARGETS and not (
                isinstance(target, dict) and target.get("source") == "file" and isinstance(target.get("path"), str)):
            errors.append(f"{where}: {'target' if gtype == 'regex' else 'focus'} {target!r} is not a valid target")
    if gtype == "regex":
        if "match" in g and not (isinstance(g["match"], str) and MATCH_RE.match(g["match"])):
            errors.append(f"{where}: match must be contains, not_contains or count:N")
        if "flags" in g and not isinstance(g["flags"], str):
            errors.append(f"{where}: flags must be a string")
    if gtype == "tool_used":
        for key in ("min", "max"):
            if key in g and not is_int(g[key]):
                errors.append(f"{where}: {key} must be a non-negative integer")
        if is_int(g.get("min", 0)) and is_int(g.get("max", 0)) and "max" in g and g.get("min", 1) > g["max"]:
            errors.append(f"{where}: min exceeds max")
    if gtype == "tool_order":
        for key in ("before", "after"):
            v = g.get(key)
            if v is not None and not isinstance(v, str) and not (isinstance(v, dict) and isinstance(v.get("tool"), str)):
                errors.append(f"{where}: {key} must be a tool name or {{tool, input_match}}")
    if gtype == "file_exists" and "exists" in g and not isinstance(g["exists"], bool):
        errors.append(f"{where}: exists must be true or false")
    return True


def case_schema_errors(rel, prompt, case, errors):
    """Validate prompt.md frontmatter, case.yaml and the merged values (prompt.md wins)."""
    if prompt is not None:
        check_keys(f"{rel}/prompt.md", prompt, PROMPT_KEYS, errors)
    if case is not None:
        where = f"{rel}/case.yaml"
        check_keys(where, case, CASE_KEYS, errors)
        if case.get("schema_version") != "1.1":
            errors.append(f"{where}: schema_version must be \"1.1\"")
        if not isinstance(case.get("name"), str) or not case.get("name"):
            errors.append(f"{where}: name is required")
        if not isinstance(case.get("execution", {}), dict):
            errors.append(f"{where}: execution must be a mapping")
        else:
            check_keys(where, case.get("execution", {}), EXECUTION_KEYS, errors, "execution ")
        if not isinstance(case.get("context", {}), dict):
            errors.append(f"{where}: context must be a mapping")
        else:
            check_keys(where, case.get("context", {}), CONTEXT_KEYS, errors, "context ")
        if not isinstance(case.get("graders", []), list):
            errors.append(f"{where}: graders must be a list")
    effective = {}
    if case is not None:
        effective.update({k: v for k, v in case.items() if k not in ("execution", "context", "graders")})
        if isinstance(case.get("execution"), dict):
            effective.update(case["execution"])
    if prompt is not None:
        effective.update(prompt)
    if "runs" in effective and not is_int(effective["runs"], 1, 50):
        errors.append(f"{rel}: runs must be an integer from 1 to 50")
    if "max_turns" in effective and not is_int(effective["max_turns"], 1, 200):
        errors.append(f"{rel}: max_turns must be an integer from 1 to 200")
    if "timeout_seconds" in effective and not is_int(effective["timeout_seconds"], 1, 3600):
        errors.append(f"{rel}: timeout_seconds must be an integer from 1 to 3600")
    for key in ("tags", "allowed_tools", "plugins"):
        v = effective.get(key)
        if v is not None and not (isinstance(v, list) and all(isinstance(x, str) for x in v)):
            errors.append(f"{rel}: {key} must be a list of strings")
    env = effective.get("env")
    if env is not None:
        if not isinstance(env, dict):
            errors.append(f"{rel}: env must be a mapping")
        else:
            errors += [f"{rel}: env key {k!r} must match EVAL_[A-Z0-9_]*" for k in env if not ENV_KEY_RE.match(str(k))]
    return effective


def resolve_plugin_paths(root, case_dir, rel, plugins, errors, warnings):
    """Map a case's `plugins:` entries to marketplace plugin names or `3rd-party/<dir>`; report bad paths."""
    names = []
    base = root.resolve()
    for entry in plugins:
        target = (case_dir / entry).resolve()
        try:
            parts = target.relative_to(base).parts
        except ValueError:
            errors.append(f"{rel}: plugins entry {entry!r} resolves outside the repo")
            continue
        if len(parts) >= 2 and parts[0] == "plugins":
            if target.is_dir():
                names.append(parts[1])
            else:
                errors.append(f"{rel}: plugins entry {entry!r} does not resolve to a plugin directory")
        elif len(parts) >= 2 and parts[0] == "3rd-party":
            token = f"3rd-party/{parts[1]}"
            names.append(token)
            if not (base / "3rd-party" / parts[1]).is_dir():
                warnings.add(f"optional checkout missing: {token} (clone it as the suite README says)")
        elif target.is_dir() and len(parts) >= 3 and parts[0] == "evals":
            names.append("/".join(parts))  # a test-only fixture plugin inside a root suite
        else:
            errors.append(f"{rel}: plugins entry {entry!r} does not resolve to a plugin directory")
    return names


def skill_test_strings(plugin, skill):
    out = []
    for name in (skill, f"{plugin}:{skill}"):
        out += [json.dumps({"skill": name}, separators=(",", ":")), json.dumps({"skill": name})]
    return out


def run_regex_batch(items, skill_ids, warnings):
    """Compile every item as JavaScript through regex_check.mjs. Returns a result list, or None without node."""
    payload = {"items": items,
               "skills": [{"id": sid, "tests": tests} for sid, tests in skill_ids.items()]}
    script = Path(__file__).resolve().parent / "regex_check.mjs"
    try:
        run = subprocess.run(["node", str(script)], input=json.dumps(payload), capture_output=True, text=True)
    except FileNotFoundError:
        warnings.add("node is not on PATH: eval regexes were not compiled and Skill graders were not resolved")
        return None
    if run.returncode != 0:
        raise SystemExit(f"regex_check.mjs failed: {run.stderr.strip()}")
    return json.loads(run.stdout)


def eval_errors(root, entries, manifests, docs, skills, own, warnings):
    errors = []
    jobs = []        # (where, label, pattern, flags, skill_ctx or None)
    expected = {}    # suite -> expected plugin set
    market_skills = {(p, s): data for (p, s), data in skills.items()}
    for suite, spec in ROOT_SUITES.items():
        want = set()
        for meta in spec["metas"]:
            want |= closure(meta, manifests, own)
        want = {n for n in want if not is_group(n)} - set(spec["exclude"]) | set(spec["extra"])
        expected[suite] = want

    loaded_cache = {}

    def loaded(names):
        key = tuple(sorted(names))
        if key not in loaded_cache:
            out = set()
            for n in names:
                out |= closure(n, manifests, own) | {n}
            loaded_cache[key] = out
        return loaded_cache[key]

    for case_dir, plugin, suite in case_dirs(root):
        rel = case_dir.relative_to(root).as_posix()
        prompt = case = None
        body = ""
        problem = False
        if (case_dir / "prompt.md").is_file():
            prompt, body, err = docs.md(case_dir / "prompt.md")
            if err:
                errors.append(f"{rel}/prompt.md: {err}")
                problem = True
        if (case_dir / "case.yaml").is_file():
            case, _, err = docs.yaml_file(case_dir / "case.yaml")
            if err:
                errors.append(f"{rel}/case.yaml: {err}")
                problem = True
        graders = []  # (where, mapping, body)
        if case is not None and isinstance(case.get("graders"), list):
            for i, g in enumerate(case["graders"]):
                if isinstance(g, dict):
                    graders.append((f"{rel}/case.yaml graders[{i}]", g, ""))
                else:
                    errors.append(f"{rel}/case.yaml: graders[{i}] must be a mapping")
        for gf in sorted((case_dir / "graders").glob("*.md")) if (case_dir / "graders").is_dir() else []:
            data, gbody, err = docs.md(gf)
            if err:
                errors.append(f"{gf.relative_to(root)}: {err}")
                problem = True
            else:
                graders.append((gf.relative_to(root).as_posix(), data, gbody))
        if not problem:
            if prompt is None and not (case and isinstance(case.get("execution"), dict) and case["execution"].get("prompt")):
                errors.append(f"{rel}: no prompt (prompt.md or execution.prompt)")
            elif prompt is not None and not body.strip() and not (case and isinstance(case.get("execution"), dict) and case["execution"].get("prompt")):
                errors.append(f"{rel}/prompt.md: the body is empty, it is the user message")
        effective = case_schema_errors(rel, prompt, case, errors)
        if not graders and not problem:
            errors.append(f"{rel}: a case needs at least one grader")

        plugin_paths = effective.get("plugins")
        if isinstance(plugin_paths, list) and all(isinstance(x, str) for x in plugin_paths):
            names = resolve_plugin_paths(root, case_dir, rel, plugin_paths, errors, warnings)
        else:
            names = []
        in_scope = set(names) | ({plugin} if plugin else set())
        if suite in expected and isinstance(plugin_paths, list):
            have, want = set(names), expected[suite]
            if have != want:
                detail = []
                if want - have:
                    detail.append(f"missing {', '.join(sorted(want - have))}")
                if have - want:
                    detail.append(f"unexpected {', '.join(sorted(have - want))}")
                errors.append(f"{rel}: plugins list drifts from the {suite} closure; {'; '.join(detail)}")
        elif suite in expected:
            errors.append(f"{rel}: a {suite} case must list its plugins")

        seen_names = set()
        for where, g, gbody in graders:
            gname = g.get("name") if "graders[" in where else Path(where).stem
            if gname in seen_names:
                errors.append(f"{where}: duplicate grader name {gname!r}")
            seen_names.add(gname)
            if not grader_schema_errors(where, g, errors):
                continue
            gtype = g["type"]
            if gtype == "llm" and not (g.get("criteria") or gbody.strip()):
                errors.append(f"{where}: llm grader needs criteria (the body or criteria)")
            if gtype == "regex" and isinstance(g.get("pattern"), str):
                jobs.append((where, "pattern", g["pattern"], g.get("flags") or "", None))
            if gtype == "tool_order":
                for key in ("before", "after"):
                    v = g.get(key)
                    if isinstance(v, dict) and isinstance(v.get("input_match"), str):
                        jobs.append((where, f"{key}.input_match", v["input_match"], "", None))
            if gtype == "tool_used":
                is_skill = g.get("tool") == "Skill"
                if is_skill and g.get("max") == 0 and g.get("arm") != "both":
                    errors.append(f"{where}: a Skill grader with max: 0 needs arm: both, or it is not scored in the baseline arm")
                if isinstance(g.get("input_match"), str):
                    ctx = {"g": g, "in_scope": in_scope} if is_skill else None
                    jobs.append((where, "input_match", g["input_match"], "", ctx))

    errors += regex_job_errors(jobs, market_skills, manifests, loaded, own, warnings)
    return errors


def regex_job_errors(jobs, skills, manifests, loaded, own, warnings):
    """Compile all patterns; resolve Skill graders to marketplace skills; apply rules 3 to 5."""
    errors = []
    if not jobs:
        return errors
    skill_ids = {f"{p}:{s}": skill_test_strings(p, s) for (p, s) in skills}
    externals = [e for e in EXTERNAL_SKILLS if not e.endswith(":*")]
    for e in externals:
        skill_ids[f"external:{e}"] = skill_test_strings("external", e)
    items = []
    for where, label, pattern, flags, ctx in jobs:
        if len(pattern) > 20000:
            errors.append(f"{where}: {label} is unreasonably long")
            pattern = ""
        items.append({"pattern": pattern, "flags": flags, "skill": ctx is not None})
    results = run_regex_batch(items, skill_ids, warnings)
    if results is None:
        return errors
    prefixes = [e[:-1] for e in EXTERNAL_SKILLS if e.endswith(":*")]
    for (where, label, pattern, flags, ctx), res in zip(jobs, results):
        if INLINE_FLAGS_RE.search(pattern):
            errors.append(f"{where}: {label} uses an inline (?i)-style flag group, which JavaScript does not support; use the flags field")
        if "error" in res:
            errors.append(f"{where}: {label} does not compile as JavaScript ({res['error']})")
            continue
        if ctx is None:
            continue
        g = ctx["g"]
        matched = [m for m in res["matched"] if not m.startswith("external:")]
        external = any(m.startswith("external:") for m in res["matched"]) or any(p in pattern for p in prefixes)
        if not matched and not external:
            errors.append(f"{where}: Skill input_match matches no known skill; fix the name, or add an external skill to EXTERNAL_SKILLS")
            continue
        if g.get("max") == 0:
            plugins_hit = {m.split(":", 1)[0] for m in matched}
            if matched and not external and not (plugins_hit & loaded(ctx["in_scope"])):
                names = ", ".join(sorted(m.split(":", 1)[1] for m in matched))
                errors.append(f"{where}: inert sibling grader; it targets {names}, which the case does not load")
        else:
            manual = [m for m in matched if skills[tuple(m.split(":", 1))].get("disable-model-invocation") is True]
            if matched and len(manual) == len(matched) and not external:
                errors.append(f"{where}: manual-only skill {', '.join(m.split(':', 1)[1] for m in manual)} never fires on its own; use a slash-invoked outcome case")
    return errors


# --- Version bumps -----------------------------------------------------------

VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


class RefError(Exception):
    pass


def since_errors(root, ref):
    """Plugins changed since `ref` (outside evals/ and README.md) must carry a higher plugin.json version."""
    if git(root, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}").returncode != 0:
        raise RefError(f"cannot resolve {ref!r} to a commit (a shallow clone may lack it; fetch more history)")
    diff = git(root, "diff", "-z", "--name-status", "--find-renames", ref, "--")
    if diff.returncode != 0:
        raise RefError(f"git diff failed: {diff.stderr.strip()}")
    changed = set()
    tokens = [t for t in diff.stdout.split("\0")]
    i = 0
    while i < len(tokens) and tokens[i]:
        status = tokens[i]
        width = 2 if status[0] in "RC" else 1
        paths = tokens[i + 1:i + 1 + width]
        i += 1 + width
        changed.update(paths[-1:] if status[0] == "R" else paths)
    others = git(root, "ls-files", "-z", "--others", "--exclude-standard")
    if others.returncode != 0:
        raise RefError(f"git ls-files failed: {others.stderr.strip()}")
    changed.update(p for p in others.stdout.split("\0") if p)

    plugins = set()
    for path in changed:
        parts = path.split("/")
        if len(parts) < 3 or parts[0] != "plugins":
            continue
        if parts[2] == "evals" or (len(parts) == 3 and parts[2] == "README.md"):
            continue
        plugins.add(parts[1])

    errors = []
    for name in sorted(plugins):
        manifest_path = root / "plugins" / name / ".claude-plugin/plugin.json"
        if not manifest_path.is_file():
            continue
        old = git(root, "show", f"{ref}:plugins/{name}/.claude-plugin/plugin.json")
        if old.returncode != 0:
            continue
        try:
            old_version = json.loads(old.stdout).get("version")
        except ValueError:
            old_version = None
        new_version = load_json(manifest_path).get("version")
        parsed = []
        for label, v in (("new", new_version), (f"{ref}", old_version)):
            m = VERSION_RE.match(v) if isinstance(v, str) else None
            if not m:
                errors.append(f"{name}: version {v!r} at {label} is not MAJOR.MINOR.PATCH")
            parsed.append(tuple(map(int, m.groups())) if m else None)
        if None in parsed:
            continue
        if parsed[0] <= parsed[1]:
            errors.append(f"{name}: changed since {ref} but version {new_version} is not greater than {old_version}; bump plugin.json and marketplace.json")
    return errors


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


UPSTREAM_RE = re.compile(r"^Upstream:\s*(\S+)\s*@\s*([0-9a-f]{7,40})\s*$", re.M)
PATHS_RE = re.compile(r"^Paths:\s*(.+)$", re.M)


def norm_url(url):
    """Compare git remotes loosely: https and ssh forms, with or without .git."""
    url = url.strip().removesuffix(".git").removesuffix("/")
    url = re.sub(r"^git@([^:]+):", r"https://\1/", url)
    return re.sub(r"^(https?|ssh)://(git@)?", "", url).lower()


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)


def upstream_records(root, names):
    """Yield (plugin, url, sha, paths) from NOTICE files that carry an Upstream line."""
    for notice in sorted((root / "plugins").glob("*/NOTICE")):
        plugin = notice.parent.name
        if names and plugin not in names:
            continue
        text = notice.read_text(errors="replace")
        ups = list(UPSTREAM_RE.finditer(text))
        for i, up in enumerate(ups):
            end = ups[i + 1].start() if i + 1 < len(ups) else len(text)
            paths_m = PATHS_RE.search(text, up.end(), end)
            paths = [p.strip() for p in paths_m.group(1).split(",") if p.strip()] if paths_m else []
            yield plugin, up.group(1), up.group(2), paths


def checkouts(root):
    """Map normalized origin URL to each checkout under 3rd-party/."""
    found = {}
    third = root / "3rd-party"
    if third.is_dir():
        for repo in sorted(p for p in third.iterdir() if (p / ".git").exists()):
            r = git(repo, "remote", "get-url", "origin")
            if r.returncode == 0:
                found[norm_url(r.stdout)] = repo
    return found


def upstream(root, names, fetch):
    repos = checkouts(root)
    fetched = set()
    seen = 0
    for plugin, url, sha, paths in upstream_records(root, set(names)):
        seen += 1
        repo = repos.get(norm_url(url))
        if repo is None:
            print(f"{plugin}: {url} has no checkout under 3rd-party/ (clone it there)")
            continue
        if fetch and repo not in fetched:
            git(repo, "fetch", "--quiet", "origin")
            fetched.add(repo)
        ref = "origin/HEAD" if git(repo, "rev-parse", "--verify", "-q", "origin/HEAD").returncode == 0 else "HEAD"
        log = git(repo, "log", "--oneline", "--no-decorate", f"{sha}..{ref}", "--", *paths)
        if log.returncode != 0:
            print(f"{plugin}: cannot compare {sha[:12]}..{ref} in {repo.name}: {log.stderr.strip()}")
        elif log.stdout.strip():
            print(f"{plugin}: {len(log.stdout.splitlines())} upstream commit(s) since {sha[:12]} in {repo.name}")
            print("  " + log.stdout.strip().replace("\n", "\n  "))
        else:
            print(f"{plugin}: up to date with {repo.name} at {sha[:12]}")
    if not seen:
        print("no NOTICE with an Upstream line" + (f" for {', '.join(names)}" if names else ""))


def agent_rows(root, entries, manifests, included_in):
    """One catalog row per agent file: invoke name, plugin, model, effort, read-only, metas."""
    rows = []
    for f in sorted((root / "plugins").glob("*/agents/*.md")):
        plugin = f.parent.parent.name
        if plugin not in entries:
            continue
        text = f.read_text(errors="replace")
        if not text.startswith("---\n") or "\n---" not in text[4:]:
            continue
        fm = {}
        for line in text[4:text.index("\n---", 4)].splitlines():
            m = re.match(r"^([A-Za-z]+):\s*(.*)$", line)
            if m:
                fm[m.group(1)] = m.group(2).strip()
        name = fm.get("name", f.stem)
        tools = fm.get("tools", "")
        edits = "no" if tools and not re.search(r"\b(Edit|Write|MultiEdit|NotebookEdit)\b", tools) else "yes"
        metas = ", ".join(included_in.get(plugin, [])) or "-"
        rows.append(f"| `{plugin}:{name}` | [`{plugin}`](plugins/{plugin}) | {fm.get('model', 'inherit')} | "
                    f"{fm.get('effort', '-')} | {edits} | {metas} |")
    return rows


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
            if len(found) == 1:
                kind = found[0][0]
            elif name in MULTI_COMPONENT and set(found) == MULTI_COMPONENT[name]:
                kind = " + ".join(dict.fromkeys(k for k, _ in found))
            else:
                kind = "invalid"
            leaves.append(f"| {link} | {kind} | {desc} | {', '.join(included_in.get(name, [])) or '-'} |")

    lines = [CATALOG_START, "", "### Meta plugins", ""]
    lines += ["| Plugin | Scope | Installs | Description |", "| --- | --- | --- | --- |", *metas] if metas else ["None yet."]
    if bundles:
        lines += ["", "### Core bundles", ""]
        lines += ["| Plugin | Installs | Used by | Description |", "| --- | --- | --- | --- |", *bundles]
    lines += ["", "### Plugins", ""]
    lines += ["| Plugin | Type | Description | In |", "| --- | --- | --- | --- |", *leaves] if leaves else ["None yet."]
    agents = agent_rows(root, entries, manifests, included_in)
    if agents:
        lines += ["", "### Agents", "",
                  "Each agent ships in its own plugin and is invoked as `plugin:agent`. Model and effort are defaults; "
                  "a caller can pass another model per call. An agent without Edit/Write tools can still change state "
                  "through Bash; if you install the optional `readonly-agent-gate`, it limits `architect`, `reviewer` and `debugger` to read-only Bash and "
                  "limits their file-writing tools to scratch paths. `architect` can also save its plan as a Markdown "
                  "file under the project's plan directory (`.claude/plans/` and `docs/plans/` by default, gate option `plan_dirs`) with "
                  "Write or Edit.", "",
                  "| Agent | Plugin | Model | Effort | Edit/Write tools | In |",
                  "| --- | --- | --- | --- | --- | --- |", *agents]
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
    if is_meta(name):
        raise SystemExit(f"{name}: `baseline` and `*-meta` names are reserved for meta plugins")
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


def category_for(root, name, manifest):
    """Category for a new marketplace entry: meta, bundle (deps only, no component) or development."""
    if is_meta(name):
        return "meta"
    if "dependencies" in manifest and not components(root / "plugins" / name, manifest):
        return "bundle"
    return "development"


def register(root, assignments):
    """Add marketplace entries for plugin dirs that lack one, then apply meta assignments."""
    market, entries, manifests = load_plugins(root)
    added = []
    for name, manifest in manifests.items():
        if name in entries or manifest is None:
            continue
        market.setdefault("plugins", []).append({
            "name": name, "source": f"./plugins/{name}", "description": manifest.get("description", ""),
            "version": manifest.get("version", "0.1.0"), "category": category_for(root, name, manifest)})
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


# --- Retiring plugins --------------------------------------------------------

_JSON = json.JSONDecoder()


def _skip_ws(text, i):
    while i < len(text) and text[i] in " \t\r\n":
        i += 1
    return i


def json_members(text, start):
    """Members of the JSON object or array whose `{` or `[` is at text[start]: ([(key, key_start, value_start, value_end, after)], close).

    The key is None for an array item. `after` is the index past the member's trailing comma, or `value_end` for the last member."""
    closer = "}" if text[start] == "{" else "]"
    i = _skip_ws(text, start + 1)
    members = []
    while text[i] != closer:
        key, member_start, j = None, i, i
        if closer == "}":
            key, j = _JSON.raw_decode(text, i)
            j = _skip_ws(text, j)
            if text[j] != ":":
                raise ValueError(f"expected ':' at {j}")
            j = _skip_ws(text, j + 1)
        _, end = _JSON.raw_decode(text, j)
        k = _skip_ws(text, end)
        after = k + 1 if text[k] == "," else end
        members.append((key, member_start, j, end, after))
        i = _skip_ws(text, after)
    return members, i


def remove_member(text, container, n):
    """Remove member `n` of the object or array at text[container], keeping every other byte (whole lines when the member has its own)."""
    members, _ = json_members(text, container)
    _, ks, _, ve, after = members[n]
    line = text.rfind("\n", 0, ks) + 1
    eol = text.find("\n", after)
    eol = len(text) if eol == -1 else eol
    if not text[line:ks].strip() and not text[after:eol].strip():
        cut = (line, min(eol + 1, len(text)))
    else:
        cut = (ks, _skip_ws(text, after))
    new = text[:cut[0]] + text[cut[1]:]
    if after == ve and n > 0:  # the last member went: the one before loses its comma
        comma = members[n - 1][4] - 1
        new = new[:comma] + new[comma + 1:]
    members, close = json_members(new, container)
    if not members:
        new = new[:container + 1] + new[close:]  # `{}` or `[]`
    return new


def top_member(text, key):
    members, _ = json_members(text, _skip_ws(text, 0))
    return next(((n, vs, ve) for n, (k, _, vs, ve, _) in enumerate(members) if k == key), None)


def remove_json_key(text, section, key):
    """Remove `key` from the top-level object `section` of a JSON text. Returns the new text."""
    found = top_member(text, section)
    if found is None or text[found[1]] != "{":
        return text
    members, _ = json_members(text, found[1])
    n = next((n for n, m in enumerate(members) if m[0] == key), None)
    return text if n is None else remove_member(text, found[1], n)


def read_raw(path):
    """File text with its line endings untouched."""
    with open(path, newline="") as f:
        return f.read()


def write_raw(path, text):
    with open(path, "w", newline="") as f:
        f.write(text)


def dump_like(original, data):
    """`data` in the standard layout, with CRLF line endings when `original` used them."""
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    return text.replace("\n", "\r\n") if "\r\n" in original else text


def save_manifest(path, data):
    """Write `data` over a plugin.json, changing only the version, description and dependency lines that differ.

    A layout or change it cannot patch (a new key, an edited value that is not a string) is rewritten whole."""
    original = text = read_raw(path)
    old = json.loads(text)
    try:
        for key, value in data.items():
            if old.get(key) == value:
                continue
            found = top_member(text, key)
            if found is None:
                raise ValueError(key)
            if isinstance(value, str):
                text = text[:found[1]] + json.dumps(value, ensure_ascii=False) + text[found[2]:]
            elif key == "dependencies" and isinstance(value, list) and all(v in old[key] for v in value):
                for n in reversed([n for n, v in enumerate(old[key]) if v not in value]):
                    text = remove_member(text, top_member(text, key)[1], n)
            else:
                raise ValueError(key)
        patched = set(old) == set(data) and json.loads(text) == data
    except (ValueError, IndexError):
        patched = False
    write_raw(path, text if patched else dump_like(original, data))


def strip_example_ids(root, ids, own):
    """Remove `<name>@<this marketplace>` for each name in `ids` from the example settings, formatting intact.

    Returns the relative paths of the files that changed."""
    changed = []
    suffix = f"@{own}"
    for f in sorted((root / EXAMPLE_SETTINGS).glob("*.json")):
        original = read_raw(f)
        data, err = read_json(f)
        if err or not isinstance(data, dict):
            continue  # deprecate refuses an unreadable example file before it writes anything
        doomed = [(section, i) for section in ("enabledPlugins", "pluginConfigs")
                  for i in (data[section] if isinstance(data.get(section), dict) else ())
                  if i.endswith(suffix) and i[:-len(suffix)] in ids]
        if not doomed:
            continue
        for section, i in doomed:
            del data[section][i]
        text = original
        try:
            for section, i in doomed:
                text = remove_json_key(text, section, i)
            intact = json.loads(text) == data
        except (ValueError, IndexError):
            intact = False
        write_raw(f, text if intact else dump_like(original, data))  # unusual layout: standard format
        changed.append(f.relative_to(root).as_posix())
    return changed


def require_catalog_markers(root):
    """Refuse before any write when the README cannot take the regenerated catalog."""
    readme = root / README
    text = readme.read_text() if readme.is_file() else ""
    if CATALOG_START not in text or CATALOG_END not in text:
        raise SystemExit(f"README.md needs {CATALOG_START} and {CATALOG_END} markers; nothing was changed")


def require_readable_examples(root):
    """Refuse before any write when an example settings file is not a JSON object."""
    for f in sorted((root / EXAMPLE_SETTINGS).glob("*.json")):
        data, err = read_json(f)
        if err or not isinstance(data, dict):
            raise SystemExit(f"{f.relative_to(root)}: {err or 'settings must be a JSON object'}; fix it first, nothing was changed")


def report_check(root, name, verb):
    """Run check after a retirement step and print its errors. Returns the exit code; the changes are kept."""
    errors = check(root)
    for e in errors:
        print(e, file=sys.stderr)
    if errors:
        print(f"{len(errors)} problem(s) after {verb} {name}; the changes were kept. Fix the references above.", file=sys.stderr)
        return 1
    print("check: ok")
    return 0


def bump_patch(name, version):
    m = VERSION_RE.match(version) if isinstance(version, str) else None
    if not m:
        raise SystemExit(f"{name}: version {version!r} is not MAJOR.MINOR.PATCH; fix it before retiring")
    major, minor, patch = map(int, m.groups())
    return f"{major}.{minor}.{patch + 1}"


def today():
    return datetime.date.today().isoformat()


def deprecate(root, name, into, reason, date):
    """Mark a plugin deprecated: description prefix, dependency and example-settings removal, version bumps, retired.json.

    Runs check at the end and returns 1 if it finds problems (the changes are kept)."""
    market, entries, manifests = load_plugins(root)
    own = market.get("name")
    tables = load_retired(root)
    if not valid_date(date):
        raise SystemExit(f"--date {date!r} must be a YYYY-MM-DD date")
    if not reason.strip():
        raise SystemExit("--reason must say why the plugin is retired")
    if name not in entries or manifests.get(name) is None:
        raise SystemExit(f"{name}: no such plugin")
    if name == "baseline":
        raise SystemExit("baseline: the installer always installs it; it cannot be deprecated")
    if name in tables["deprecated"] or name in tables["archived"]:
        raise SystemExit(f"{name}: already {'deprecated' if name in tables['deprecated'] else 'archived'}")
    if into is not None:
        if into == name or into not in entries:
            raise SystemExit(f"--into {into}: not another plugin in this marketplace")
        if into in tables["deprecated"] or into in tables["archived"]:
            raise SystemExit(f"--into {into}: that plugin is itself retired")
    users = dependents(name, manifests, own)
    blockers = users if is_meta(name) else [u for u in users if not is_group(u)]
    if blockers:
        raise SystemExit(f"{name}: still a dependency of {', '.join(blockers)}; "
                         "decide what replaces it there, edit those plugins, then deprecate")
    groups = [u for u in users if is_group(u)]
    versions = {n: bump_patch(n, manifests[n].get("version")) for n in [name, *groups]}
    require_yaml()
    require_catalog_markers(root)
    require_readable_examples(root)

    prefix = deprecation_prefix(into)
    changed = []
    manifest_path = root / "plugins" / name / ".claude-plugin/plugin.json"
    manifest = manifests[name]
    entry = entries[name]
    for doc in (manifest, entry):
        if not doc.get("description", "").startswith(prefix):
            doc["description"] = prefix + doc.get("description", "")
        doc["version"] = versions[name]
    save_manifest(manifest_path, manifest)
    changed.append(manifest_path.relative_to(root).as_posix())
    for group in groups:
        path = root / "plugins" / group / ".claude-plugin/plugin.json"
        gm = manifests[group]
        gm["dependencies"] = [d for d in gm["dependencies"]
                              if not (parse_dep(d)[0] == name and parse_dep(d)[1] in (None, own))]
        gm["version"] = entries[group]["version"] = versions[group]
        save_manifest(path, gm)
        changed.append(path.relative_to(root).as_posix())
    write_json(root / MARKETPLACE, market)
    changed.append(MARKETPLACE.as_posix())
    changed += strip_example_ids(root, {name}, own)
    tables["deprecated"][name] = {"into": into, "reason": reason, "date": date}
    write_retired(root, tables)
    changed.append(RETIRED.as_posix())
    if write_catalog(root):
        changed.append(README.as_posix())
    print(f"Deprecated {name}" + (f" (use {into})" if into else "") + ". Changed:")
    for path in changed:
        print(f"  {path}")
    print(f"Archive it a release later with: scripts/plugins.py archive {name}")
    return report_check(root, name, "deprecating")


def in_work_tree(root):
    top = git(root, "rev-parse", "--show-toplevel")
    return top.returncode == 0 and Path(top.stdout.strip()).resolve() == root.resolve()


def move_plugin(root, name):
    """Move plugins/<name> to archive/plugins/<name>, with `git mv` when the path is tracked."""
    src, dest = Path("plugins") / name, ARCHIVE / name
    (root / dest).parent.mkdir(parents=True, exist_ok=True)
    if in_work_tree(root) and git(root, "ls-files", "--error-unmatch", "--", src.as_posix()).returncode == 0:
        moved = git(root, "mv", src.as_posix(), dest.as_posix())
        if moved.returncode == 0:
            return "git mv"
        print(f"git mv failed ({moved.stderr.strip()}); moving the directory instead", file=sys.stderr)
    shutil.move(str(root / src), str(root / dest))
    return "move"


def archive(root, name, force, date):
    """Move a deprecated plugin to archive/plugins and drop its marketplace entry, then run check."""
    market, entries, manifests = load_plugins(root)
    own = market.get("name")
    tables = load_retired(root)
    if not valid_date(date):
        raise SystemExit(f"--date {date!r} must be a YYYY-MM-DD date")
    if name in tables["archived"]:
        raise SystemExit(f"{name}: already archived")
    if name == "baseline":
        raise SystemExit("baseline: the installer always installs it; it cannot be archived")
    if name not in tables["deprecated"]:
        if not force:
            raise SystemExit(f"{name}: not deprecated; run `plugins.py deprecate {name}` first, or pass --force")
        if is_group(name):
            raise SystemExit(f"{name}: a meta plugin or core bundle must be deprecated before it is archived, even with --force")
    if name not in entries or manifests.get(name) is None:
        raise SystemExit(f"{name}: no such plugin in plugins/ and marketplace.json")
    if (root / "plugins" / name).is_symlink():
        raise SystemExit(f"plugins/{name} is a symlink; archive moves real directories only")
    require_yaml()
    require_catalog_markers(root)
    if (root / ARCHIVE / name).exists() or (root / ARCHIVE / name).is_symlink():
        raise SystemExit(f"{ARCHIVE}/{name} already exists")
    users = dependents(name, manifests, own)
    if users:
        raise SystemExit(f"{name}: still a dependency of {', '.join(users)}; remove it from them first")

    how = move_plugin(root, name)
    market["plugins"] = [e for e in market["plugins"] if e.get("name") != name]
    write_json(root / MARKETPLACE, market)
    record = tables["deprecated"].pop(name, None) or {
        "into": None, "reason": "archived without a prior deprecation (--force)", "date": date}
    tables["archived"][name] = {**record, "archived": date}
    write_retired(root, tables)
    write_catalog(root)
    print(f"Archived {name}: plugins/{name} -> {ARCHIVE}/{name} ({how}), marketplace.json entry removed, "
          f"{RETIRED} updated, README catalog regenerated.")
    return report_check(root, name, "archiving")


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
    p_check = sub.add_parser("check", help="check structure rules, frontmatter, eval cases and catalog freshness")
    p_check.add_argument("--since", metavar="REF",
                         help="also require a version bump for each plugin changed since REF (a commit, tag or branch)")
    sub.add_parser("sync-shared", help="copy scripts/shared files over their plugin copies")
    p_up = sub.add_parser("upstream", help="list upstream commits since each port's recorded NOTICE commit")
    p_up.add_argument("plugins", nargs="*", help="limit to these plugins")
    p_up.add_argument("--fetch", action="store_true", help="git fetch each 3rd-party checkout first")
    p_cat = sub.add_parser("catalog", help="regenerate the README plugin catalog")
    p_cat.add_argument("--check", action="store_true", help="exit 1 if the catalog is stale")
    p_dep = sub.add_parser("deprecate", help="mark a plugin deprecated; archive it a release later")
    p_dep.add_argument("name")
    p_dep.add_argument("--into", metavar="PLUGIN", help="the plugin that replaces it")
    p_dep.add_argument("--reason", required=True, help="why it is retired")
    p_dep.add_argument("--date", default=None, metavar="YYYY-MM-DD", help="record this date (default: today)")
    p_arc = sub.add_parser("archive", help="move a deprecated plugin to archive/plugins and run check")
    p_arc.add_argument("name")
    p_arc.add_argument("--force", action="store_true", help="archive a plugin that was never deprecated")
    p_arc.add_argument("--date", default=None, metavar="YYYY-MM-DD", help="record this date (default: today)")
    args = parser.parse_args(argv)

    if args.cmd == "new":
        new(root, args.name, args.kind, args.description, args.meta)
    elif args.cmd == "register":
        register(root, args.meta)
    elif args.cmd == "deprecate":
        return deprecate(root, args.name, args.into, args.reason, args.date or today())
    elif args.cmd == "archive":
        return archive(root, args.name, args.force, args.date or today())
    elif args.cmd == "upstream":
        upstream(root, args.plugins, args.fetch)
    elif args.cmd == "sync-shared":
        sync_shared(root)
    elif args.cmd == "check":
        warnings = set()
        try:
            errors = check(root, args.since, warnings)
        except RefError as e:
            print(f"--since: {e}", file=sys.stderr)
            return 2
        for w in sorted(warnings):
            print(f"warning: {w}", file=sys.stderr)
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
