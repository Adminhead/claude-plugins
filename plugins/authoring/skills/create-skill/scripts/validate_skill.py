#!/usr/bin/env python3
"""Conservative, stdlib-only validation for a Claude Code skill directory.

Checks the frontmatter fields Claude Code recognizes (which it otherwise ignores
silently when misspelled), the portable Agent Skills name and description rules,
and local Markdown links. This is not a complete YAML or Markdown parser.
Unsupported YAML is diagnosed rather than interpreted.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path, PureWindowsPath
from urllib.parse import unquote

EXIT_INVALID = 1
EXIT_USAGE = 2
EXIT_PATH = 3
MAX_DIAGNOSTICS = 100
STRING_FIELDS = {
    "name",
    "description",
    "when_to_use",
    "argument-hint",
    "model",
    "agent",
    "license",
    "compatibility",
}
BOOLEAN_FIELDS = {"disable-model-invocation", "user-invocable", "background"}
ENUM_FIELDS = {
    "context": {"fork"},
    "effort": {"low", "medium", "high", "xhigh", "max"},
    "shell": {"bash", "powershell"},
}
# Fields that may be a string, a YAML list, or a mapping; only presence is checked.
OPAQUE_FIELDS = {"allowed-tools", "disallowed-tools", "paths", "arguments", "hooks"}
ALLOWED_FIELDS = STRING_FIELDS | BOOLEAN_FIELDS | set(ENUM_FIELDS) | OPAQUE_FIELDS | {"metadata"}
BOOLEAN_VALUES = {"true", "false", "yes", "no", "on", "off", "1", "0"}
LISTING_CAP = 1536
KEY_RE = re.compile(r"^([A-Za-z][A-Za-z0-9-]*):(?:[ \t]*(.*))?$")
NUMBER_RE = re.compile(
    r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$", re.IGNORECASE
)
INLINE_LINK_RE = re.compile(r"!?\[[^]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))")
CODE_SPAN_RE = re.compile(r"(`+)[^`]*?\1")
REFERENCE_LINK_RE = re.compile(r"^\s{0,3}\[[^]\n]+\]:\s*(?:<([^>]+)>|(\S+))")


@dataclass(frozen=True)
class Diagnostic:
    code: str
    message: str
    path: str
    line: int | None = None


@dataclass(frozen=True)
class Scalar:
    value: str | None
    supported: bool


def add(diagnostics: list[Diagnostic], code: str, message: str, path: Path, line: int | None = None) -> None:
    if len(diagnostics) < MAX_DIAGNOSTICS:
        diagnostics.append(Diagnostic(code, message, str(path), line))


def indentation(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def strip_plain_comment(value: str) -> str:
    """Remove a YAML-style comment from a simple plain scalar."""
    marker = value.find(" #")
    return value if marker == -1 else value[:marker].rstrip()


def parse_scalar(value: str, path: Path, line: int, diagnostics: list[Diagnostic]) -> Scalar:
    value = value.strip()
    if not value or value.startswith("#"):
        return Scalar(None, False)
    if value[0] == "'":
        if len(value) < 2 or not value.endswith("'"):
            add(diagnostics, "yaml-quoted", "multiline or unterminated quoted scalars are unsupported", path, line)
            return Scalar(None, False)
        return Scalar(value[1:-1].replace("''", "'"), True)
    if value[0] == '"':
        if len(value) < 2 or not value.endswith('"'):
            add(diagnostics, "yaml-quoted", "multiline or unterminated quoted scalars are unsupported", path, line)
            return Scalar(None, False)
        try:
            return Scalar(json.loads(value), True)
        except json.JSONDecodeError:
            add(diagnostics, "yaml-quoted", "double-quoted scalar uses unsupported YAML escaping", path, line)
            return Scalar(None, False)
    if value[0] in "[{&*!":
        add(diagnostics, "yaml-unsupported", "flow collections, anchors, aliases, and tags are unsupported", path, line)
        return Scalar(None, False)
    plain = strip_plain_comment(value)
    if plain.lower() in {"null", "~", "true", "false", ".nan", ".inf", "-.inf", "+.inf"} or NUMBER_RE.fullmatch(plain):
        add(diagnostics, "yaml-type", "field must be a YAML string; quote this scalar", path, line)
        return Scalar(None, False)
    return Scalar(plain, True)


def parse_block(lines: list[str], start: int, parent_indent: int, style: str) -> tuple[str, int]:
    block: list[str] = []
    index = start
    while index < len(lines):
        raw = lines[index]
        if raw.strip() and indentation(raw) <= parent_indent:
            break
        if not raw.strip():
            next_content = index + 1
            while next_content < len(lines) and not lines[next_content].strip():
                next_content += 1
            if next_content >= len(lines) or indentation(lines[next_content]) <= parent_indent:
                break
        block.append(raw)
        index += 1
    content_indents = [indentation(line) for line in block if line.strip()]
    content_indent = min(content_indents, default=parent_indent + 1)
    content = [line[content_indent:] if line.strip() else "" for line in block]
    if style.startswith(">"):
        result = ""
        for item in content:
            if not result:
                result = item
            elif not item or result.endswith("\n"):
                result += "\n" + item
            else:
                result += " " + item
    else:
        result = "\n".join(content)
    if not style.endswith("-"):
        result += "\n"
    return result, index


def parse_metadata(lines: list[str], start: int, path: Path, diagnostics: list[Diagnostic]) -> tuple[dict[str, str] | None, int]:
    metadata: dict[str, str] = {}
    index = start
    while index < len(lines):
        raw = lines[index]
        if not raw.strip():
            index += 1
            continue
        if indentation(raw) == 0:
            break
        match = re.match(r"^\s+([^:#][^:]*):(?:[ \t]*(.*))?$", raw)
        if not match:
            add(diagnostics, "metadata", "metadata must be a simple string-to-string mapping", path, index + 1)
            return None, index + 1
        key = match.group(1).strip()
        scalar = parse_scalar(match.group(2) or "", path, index + 1, diagnostics)
        if not key or not scalar.supported or scalar.value is None:
            add(diagnostics, "metadata", "metadata keys and values must be non-empty YAML strings", path, index + 1)
        elif key in metadata:
            add(diagnostics, "metadata", f"duplicate metadata key: {key}", path, index + 1)
        else:
            metadata[key] = scalar.value
        index += 1
    return metadata, index


def parse_frontmatter(skill_md: Path, diagnostics: list[Diagnostic]) -> dict[str, Scalar]:
    try:
        lines = skill_md.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        add(diagnostics, "encoding", "SKILL.md must be UTF-8 text", skill_md)
        return {}
    if not lines or lines[0] != "---":
        add(diagnostics, "frontmatter", "SKILL.md must start with a YAML frontmatter delimiter", skill_md, 1)
        return {}
    end = next((i for i, line in enumerate(lines[1:], 1) if line in {"---", "..."}), None)
    if end is None:
        add(diagnostics, "frontmatter", "frontmatter closing delimiter is missing", skill_md, 1)
        return {}

    fields: dict[str, Scalar] = {}
    index = 1
    while index < end:
        raw = lines[index]
        if not raw.strip() or raw.lstrip().startswith("#"):
            index += 1
            continue
        if indentation(raw) != 0:
            add(diagnostics, "yaml-unsupported", "top-level YAML must use simple mappings", skill_md, index + 1)
            index += 1
            continue
        match = KEY_RE.match(raw)
        if not match:
            add(diagnostics, "yaml-unsupported", "unsupported frontmatter syntax", skill_md, index + 1)
            index += 1
            continue
        key, raw_value = match.groups()
        if key in fields:
            add(diagnostics, "yaml-duplicate", f"duplicate frontmatter field: {key}", skill_md, index + 1)
        if key not in ALLOWED_FIELDS:
            add(diagnostics, "field-unknown", f"unsupported frontmatter field: {key}", skill_md, index + 1)
        value = raw_value or ""
        block_styles = {"|", "|-", "|+", ">", ">-", ">+"}
        if key == "metadata":
            if not value.strip():
                metadata, index = parse_metadata(lines[:end], index + 1, skill_md, diagnostics)
                fields[key] = Scalar(
                    json.dumps(metadata, ensure_ascii=False)
                    if metadata is not None
                    else None,
                    metadata is not None,
                )
            else:
                add(
                    diagnostics,
                    "metadata",
                    "metadata must be an indented string-to-string mapping",
                    skill_md,
                    index + 1,
                )
                if value.strip() in block_styles:
                    _, index = parse_block(lines[:end], index + 1, 0, value.strip())
                else:
                    index += 1
                fields[key] = Scalar(None, False)
            continue
        if key in OPAQUE_FIELDS:
            if not value.strip() or value.strip() in block_styles:
                _, index = parse_block(lines[:end], index + 1, 0, value.strip() or "|")
            else:
                index += 1
            fields[key] = Scalar(value.strip() or "<block>", True)
            continue
        if key in BOOLEAN_FIELDS:
            plain = strip_plain_comment(value.strip()).strip("'\"")
            if plain.lower() not in BOOLEAN_VALUES:
                add(diagnostics, "yaml-type", f"{key} must be a boolean", skill_md, index + 1)
            fields[key] = Scalar(plain, True)
            index += 1
            continue
        if value.strip() in block_styles:
            parsed, index = parse_block(lines[:end], index + 1, 0, value.strip())
            fields[key] = Scalar(parsed, True)
            continue
        fields[key] = parse_scalar(value, skill_md, index + 1, diagnostics)
        index += 1
    return fields


def valid_name(name: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name)) and len(name) <= 64


def is_external(destination: str) -> bool:
    return bool(
        re.match(r"^(?:https?|mailto|tel|data):", destination, re.IGNORECASE)
    )


def markdown_lines(path: Path) -> list[tuple[int, str]]:
    result: list[tuple[int, str]] = []
    fenced = False
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        stripped = line.lstrip()
        if stripped.startswith(("```", "~~~")):
            fenced = not fenced
            continue
        if not fenced:
            result.append((number, line))
    return result


def validate_link(destination: str, source: Path, root: Path, line: int, diagnostics: list[Diagnostic]) -> None:
    destination = destination.strip()
    if not destination or destination.startswith("#") or is_external(destination):
        return
    path_text = unquote(destination.split("#", 1)[0])
    if not path_text:
        return
    candidate = Path(path_text)
    if candidate.is_absolute() or PureWindowsPath(path_text).is_absolute():
        add(diagnostics, "link-absolute", f"local Markdown link must be relative: {destination}", source, line)
        return
    resolved = (source.parent / candidate).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        add(diagnostics, "link-escape", f"local Markdown link leaves the skill root: {destination}", source, line)
        return
    if not resolved.exists():
        add(diagnostics, "link-missing", f"local Markdown link target does not exist: {destination}", source, line)


def validate_links(root: Path, diagnostics: list[Diagnostic]) -> None:
    for markdown in root.rglob("*.md"):
        if not markdown.is_file():
            continue
        try:
            lines = markdown_lines(markdown)
        except UnicodeDecodeError:
            add(diagnostics, "encoding", "Markdown file must be UTF-8 text", markdown)
            continue
        for line_number, line in lines:
            line = CODE_SPAN_RE.sub("", line)
            for match in INLINE_LINK_RE.finditer(line):
                validate_link(match.group(1) or match.group(2), markdown, root, line_number, diagnostics)
            match = REFERENCE_LINK_RE.match(line)
            if match:
                validate_link(match.group(1) or match.group(2), markdown, root, line_number, diagnostics)


def validate(root: Path) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    skill_md = root / "SKILL.md"
    if not root.is_dir():
        add(diagnostics, "skill-dir", "skill directory does not exist or is not a directory", root)
        return diagnostics
    if not skill_md.is_file():
        add(diagnostics, "skill-md", "skill directory must contain SKILL.md", skill_md)
        return diagnostics
    fields = parse_frontmatter(skill_md, diagnostics)
    for required in ("name", "description"):
        if required not in fields or not fields[required].supported or fields[required].value is None:
            add(diagnostics, "required", f"required string field is missing or invalid: {required}", skill_md)
    name = fields.get("name")
    if name and name.value is not None:
        if not valid_name(name.value):
            add(diagnostics, "name", "name must use 1–64 ASCII lowercase letters, numbers, or hyphens in kebab-case", skill_md)
        if name.value != root.name:
            add(diagnostics, "name-directory", "name must exactly match the parent directory name", skill_md)
    description = fields.get("description")
    if description and description.value is not None and (not description.value.strip() or len(description.value) > 1024):
        add(diagnostics, "description", "description must be 1–1024 characters and not all whitespace", skill_md)
    for optional in sorted(STRING_FIELDS - {"name", "description"}):
        field = fields.get(optional)
        if field and (not field.supported or field.value is None):
            add(diagnostics, optional, f"{optional} must be a YAML string", skill_md)
    for key, allowed in ENUM_FIELDS.items():
        field = fields.get(key)
        if field and field.value not in allowed:
            add(diagnostics, key, f"{key} must be one of: {', '.join(sorted(allowed))}", skill_md)
    listing = "".join(
        fields[key].value or "" for key in ("description", "when_to_use") if key in fields
    )
    if len(listing) > LISTING_CAP:
        add(
            diagnostics,
            "listing-cap",
            f"description plus when_to_use is {len(listing)} characters; Claude Code truncates the skill listing at {LISTING_CAP}",
            skill_md,
        )
    compatibility = fields.get("compatibility")
    if compatibility and compatibility.value is not None and len(compatibility.value) > 500:
        add(diagnostics, "compatibility", "compatibility must be at most 500 characters", skill_md)
    validate_links(root.resolve(), diagnostics)
    return diagnostics


def main() -> int:
    parser = argparse.ArgumentParser(description="Conservatively validate a Claude Code skill directory.")
    parser.add_argument("skill_dir", type=Path, help="Directory containing SKILL.md")
    parser.add_argument("--json", action="store_true", help="Write a JSON result to stdout")
    args = parser.parse_args()

    diagnostics = validate(args.skill_dir.expanduser())
    valid = not diagnostics
    payload = {"diagnostics": [asdict(item) for item in diagnostics], "valid": valid}
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    else:
        print(f"{'valid' if valid else 'invalid'}: {args.skill_dir}")
    for item in diagnostics:
        location = f"{item.path}:{item.line}" if item.line else item.path
        print(f"{location}: {item.code}: {item.message}", file=sys.stderr)
    return 0 if valid else EXIT_INVALID


if __name__ == "__main__":
    raise SystemExit(main())
