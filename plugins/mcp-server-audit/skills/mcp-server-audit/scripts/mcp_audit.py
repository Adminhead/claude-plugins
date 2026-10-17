#!/usr/bin/env python3
"""Offline checks on an MCP server's advertised tool surface.

Reads a saved `tools/list` result (JSON) and never contacts a server.

  scan   FILE              flag hidden instructions, smuggled Unicode, sensitive
                           paths, cross-tool references and oversized text
  pin    FILE --out PINS   write a SHA-256 per tool plus one for the whole surface
  verify FILE --pins PINS  compare against pins; exit 1 on any added, removed or
                           changed tool (a possible rug pull)

FILE may be the Inspector CLI's `--format json` output ({"result": {"tools": [...]}}),
a bare result ({"tools": [...]}), or a JSON list of tools. Use "-" for stdin.
Run with `python3 -I` so nothing is imported from the working directory.
"""
import argparse
import hashlib
import json
import re
import sys
import unicodedata

MAX_INPUT_BYTES = 10 * 1024 * 1024
MAX_TEXT_CHARS = 20_000  # each text field is truncated before regex matching
OVERSIZED_DESCRIPTION = 1500

# Instructions aimed at the model rather than documentation for it.
POISON_PATTERNS = [
    (r"\b(do not|don't|never) (tell|inform|mention|reveal|show)\b[^.\n]{0,40}\buser\b", "hides-from-user"),
    (r"\bignore (all |any )?(previous|prior|above|earlier|other) (instructions|rules|tools)\b", "override-instructions"),
    (r"<\s*/?\s*(important|system|instructions?|secret|hidden)\s*>|\[\s*(system|important)\s*\]", "pseudo-tag"),
    (r"\bbefore (using|calling|invoking) (this|any|the \w+) tool\b", "precondition-hook"),
    (r"\b(always|first|must) (call|use|invoke|run)\b[^.\n]{0,40}\btool\b", "chains-other-tool"),
    (r"\b(send|upload|post|forward|exfiltrate|transmit)\b[^.\n]{0,60}\b(https?://|webhook|email|endpoint)", "sends-data-out"),
    (r"\b(pass|include|put|add)\b[^.\n]{0,40}\b(contents?|text|data)\b[^.\n]{0,40}\b(parameter|argument|field)\b", "smuggles-into-argument"),
    (r"\b(instead of|rather than|replace|override|overrides)\b[^.\n]{0,40}\btool\b", "shadows-tool"),
    (r"\byou (must|should always|are required to)\b", "addresses-model"),
]
SENSITIVE = re.compile(
    r"(~|\$HOME|/home/\w+|/Users/\w+)?/?\.(ssh|aws|gnupg|kube|docker|netrc|npmrc|pypirc|env|claude\.json|mcp\.json|cursor)\b"
    r"|id_(rsa|ed25519|ecdsa)|/etc/(passwd|shadow)|credentials(\.json)?\b|private[_ ]key|api[_ ]?key|bearer token",
    re.IGNORECASE,
)
URL = re.compile(r"\b(https?|file|ftp)://[^\s\"'<>)]{1,200}", re.IGNORECASE)
BASE64_BLOB = re.compile(r"[A-Za-z0-9+/]{80,}={0,2}")
INVISIBLE_CATEGORIES = {"Cf", "Co", "Cn"}  # format (zero-width, bidi), private use, unassigned


def load_tools(path):
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1) if path == "-" else _read(path)
    if len(raw) > MAX_INPUT_BYTES:
        raise SystemExit(f"input larger than {MAX_INPUT_BYTES} bytes; refusing")
    data = json.loads(raw.decode("utf-8"))
    if isinstance(data, dict) and isinstance(data.get("result"), dict):
        data = data["result"]
    if isinstance(data, dict):
        data = data.get("tools")
    if not isinstance(data, list) or not all(isinstance(t, dict) and isinstance(t.get("name"), str) for t in data):
        raise SystemExit("no tools array with named tools found")
    return data


def _read(path):
    with open(path, "rb") as fh:
        return fh.read(MAX_INPUT_BYTES + 1)


def text_fields(tool):
    """Yield (location, text) for every string the model reads: name, title,
    description, and every string inside inputSchema/outputSchema/annotations."""
    for key in ("name", "title", "description"):
        if isinstance(tool.get(key), str):
            yield key, tool[key]

    def walk(obj, where):
        if isinstance(obj, str):
            yield where, obj
        elif isinstance(obj, dict):
            for k, v in obj.items():
                if k == "$schema":  # a JSON Schema dialect URI, not model-facing text
                    continue
                yield from walk(k, f"{where}.<key>") if isinstance(k, str) and len(k) > 40 else ()
                yield from walk(v, f"{where}.{k}")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                yield from walk(v, f"{where}[{i}]")

    for key in ("inputSchema", "outputSchema", "annotations"):
        if key in tool:
            yield from walk(tool[key], key)


def invisible_chars(text):
    found = []
    for ch in text:
        cp = ord(ch)
        if unicodedata.category(ch) in INVISIBLE_CATEGORIES or 0xE0000 <= cp <= 0xE007F:
            found.append(f"U+{cp:04X}")
    return sorted(set(found))


def scan_tools(tools):
    names = {t["name"] for t in tools}
    findings = []
    for tool in tools:
        name = tool["name"]
        for where, text in text_fields(tool):
            sample = text[:MAX_TEXT_CHARS]
            low = sample.lower()
            flags = []
            hidden = invisible_chars(sample)
            if hidden:
                flags.append("invisible-unicode:" + ",".join(hidden[:8]))
            if unicodedata.normalize("NFKC", sample) != sample:
                flags.append("non-normalized-unicode")
            for pattern, label in POISON_PATTERNS:
                if re.search(pattern, low):
                    flags.append(label)
            if SENSITIVE.search(sample):
                flags.append("sensitive-path-or-secret")
            if URL.search(sample):
                flags.append("url")
            if BASE64_BLOB.search(sample):
                flags.append("encoded-blob")
            others = sorted(n for n in names if n != name and len(n) > 2 and re.search(r"\b" + re.escape(n) + r"\b", sample))
            if others:
                flags.append("mentions-tool:" + ",".join(others[:5]))
            if where == "description" and len(text) > OVERSIZED_DESCRIPTION:
                flags.append(f"oversized:{len(text)}")
            if flags:
                findings.append({"tool": name, "field": where, "flags": flags, "excerpt": _excerpt(sample)})
    return findings


def _excerpt(text, limit=240):
    shown = "".join(f"<U+{ord(c):04X}>" if unicodedata.category(c) in INVISIBLE_CATEGORIES else c for c in text[:limit])
    return shown + ("..." if len(text) > limit else "")


def canonical(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def pin_tools(tools):
    per_tool = {t["name"]: hashlib.sha256(canonical(t).encode("utf-8")).hexdigest() for t in tools}
    surface = hashlib.sha256(canonical(sorted(per_tool.items())).encode("utf-8")).hexdigest()
    return {"surface": surface, "tools": dict(sorted(per_tool.items()))}


def diff_pins(old, new):
    o, n = old.get("tools", {}), new["tools"]
    return {
        "added": sorted(set(n) - set(o)),
        "removed": sorted(set(o) - set(n)),
        "changed": sorted(k for k in set(o) & set(n) if o[k] != n[k]),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan")
    s.add_argument("file")
    p = sub.add_parser("pin")
    p.add_argument("file")
    p.add_argument("--out", required=True)
    v = sub.add_parser("verify")
    v.add_argument("file")
    v.add_argument("--pins", required=True)
    args = ap.parse_args(argv)

    tools = load_tools(args.file)
    if args.cmd == "scan":
        findings = scan_tools(tools)
        print(json.dumps({"tools": len(tools), "findings": findings}, indent=2, ensure_ascii=True))
        return 1 if findings else 0
    if args.cmd == "pin":
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(pin_tools(tools), fh, indent=2)
            fh.write("\n")
        print(f"pinned {len(tools)} tools to {args.out}")
        return 0
    with open(args.pins, encoding="utf-8") as fh:
        old = json.load(fh)
    new = pin_tools(tools)
    delta = diff_pins(old, new)
    print(json.dumps({"surface_changed": old.get("surface") != new["surface"], **delta}, indent=2))
    return 1 if any(delta.values()) else 0


if __name__ == "__main__":
    sys.exit(main())
