"""Parse scanner output into one normalized, redacted, deduplicated findings list."""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass, field

# "unrated" marks advisories that carry no score (govulncheck, pip-audit).
SEVERITIES = ("critical", "high", "medium", "unrated", "low", "info")
SEVERITY_RANK = {name: rank for rank, name in enumerate(SEVERITIES)}
TOOL_SEVERITY = {
    "CRITICAL": "critical",
    "ERROR": "high",
    "HIGH": "high",
    "WARNING": "medium",
    "MEDIUM": "medium",
    "INFO": "low",
    "LOW": "low",
    "INVENTORY": "info",
    "EXPERIMENT": "info",
    "UNKNOWN": "unrated",
}
TRIVY_ECOSYSTEMS = {
    "pip": "pypi",
    "pipenv": "pypi",
    "poetry": "pypi",
    "uv": "pypi",
    "python-pkg": "pypi",
    "npm": "npm",
    "yarn": "npm",
    "pnpm": "npm",
    "bun": "npm",
    "node-pkg": "npm",
    "gomod": "go",
    "gobinary": "go",
    "cargo": "rust",
    "rustbinary": "rust",
    "composer": "php",
    "bundler": "ruby",
    "gemspec": "ruby",
    "pom": "java",
    "gradle": "java",
    "nuget": "dotnet",
    "dotnet-core": "dotnet",
    "packages-props": "dotnet",
}
REACHABILITY_RANK = {"called": 0, "imported": 1, "required": 2}
TITLE_CHARS = 120

REDACTED = "[REDACTED]"
SECRET_PATTERNS = (
    re.compile(r"\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{22,}"),
    re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}"),
    re.compile(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*KEY-----|\Z)"
    ),
)
SECRET_ASSIGNMENT = re.compile(
    r"(?i)((?:secret|token|passw(?:or)?d|pwd|api[_-]?key|access[_-]?key|credential)"
    r"[\w.-]*[\"']?\s*[:=]+\s*[\"']?)([^\s\"']{6,})"
)


@dataclass
class Finding:
    tool: str
    category: str  # secret | code | dependency
    severity: str
    location: str
    title: str
    changed_on_branch: bool
    fixed_version: str = ""
    snippet: str = ""
    detail: str = ""
    reachability: str = ""
    ecosystem: str = ""
    package: str = ""
    version: str = ""
    vuln_ids: list[str] = field(default_factory=list)
    id: str = ""

    def to_json(self) -> dict[str, object]:
        return {key: value for key, value in asdict(self).items() if value != ""}


def redact(text: str, known: Iterable[str] = ()) -> str:
    for secret in known:
        if secret and secret != "REDACTED":
            text = text.replace(secret, REDACTED)
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(REDACTED, text)
    return SECRET_ASSIGNMENT.sub(lambda m: m.group(1) + REDACTED, text)


def clip(text: str, limit: int = TITLE_CHARS) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def tool_severity(value: str) -> str:
    return TOOL_SEVERITY.get(value.upper(), "unrated")


# --- secrets ---


def parse_gitleaks(report: list[dict], strip_prefix: str = "") -> list[Finding]:
    """Parse a gitleaks JSON report; `strip_prefix` maps a temp-dir copy back."""
    findings = []
    for leak in report:
        path = leak["File"]
        if strip_prefix and path.startswith(strip_prefix):
            path = path[len(strip_prefix) :].lstrip("/")
        commit = leak.get("Commit", "")
        where = f" in commit {commit[:8]}" if commit else " (uncommitted)"
        secret = leak.get("Secret", "")
        findings.append(
            Finding(
                tool="gitleaks",
                category="secret",
                severity="high",
                location=f"{path}:{leak['StartLine']}",
                title=leak["RuleID"] + where,
                changed_on_branch=True,
                snippet=redact(
                    leak.get("Match", "").replace(secret, REDACTED), [secret]
                ),
            )
        )
    return findings


# --- code ---


def parse_semgrep(
    data: dict, read_lines: Callable[[str, int, int], str]
) -> tuple[list[Finding], list[str]]:
    """Return findings plus error messages; snippets come from the working tree."""
    findings = []
    for result in data.get("results", []):
        rule = result["check_id"]
        path = result["path"]
        start, end = result["start"]["line"], result["end"]["line"]
        is_secret = "secrets" in rule.split(".")
        extra = result.get("extra", {})
        snippet = "" if is_secret else read_lines(path, start, end)
        findings.append(
            Finding(
                tool="semgrep",
                category="secret" if is_secret else "code",
                severity=tool_severity(extra.get("severity", "")),
                location=f"{path}:{start}",
                title=rule.rsplit(".", 1)[-1],
                changed_on_branch=True,
                snippet=redact(snippet),
                detail=redact(clip(extra.get("message", ""), 300)),
            )
        )
    errors = [
        redact(clip(error.get("message", ""), 200))
        for error in data.get("errors", [])
        if error.get("level") == "error"
    ]
    return findings, errors


# --- dependencies ---


def normalize_package(ecosystem: str, name: str) -> str:
    if ecosystem == "pypi":
        return re.sub(r"[-_.]+", "-", name).lower()
    return name


def normalize_version(version: str) -> str:
    return version.removeprefix("v")


def dependency(
    tool: str,
    ecosystem: str,
    package: str,
    version: str,
    target: str,
    changed: set[str],
    *,
    severity: str,
    title: str,
    fixed: str,
    ids: Iterable[str],
    reachability: str = "",
) -> Finding:
    return Finding(
        tool=tool,
        category="dependency",
        severity=severity,
        location=f"{package}@{version} ({target})",
        title=clip(title),
        changed_on_branch=target in changed,
        fixed_version=fixed,
        reachability=reachability,
        ecosystem=ecosystem,
        package=package,
        version=version,
        vuln_ids=sorted({i for i in ids if i}),
    )


def parse_trivy(
    data: dict, changed: set[str]
) -> tuple[list[Finding], list[tuple[str, str]]]:
    """Return findings plus the (ecosystem, target) pairs trivy analyzed."""
    findings, covered = [], []
    for result in data.get("Results") or []:
        ecosystem = TRIVY_ECOSYSTEMS.get(result.get("Type", ""))
        if ecosystem is None:
            continue
        target = result["Target"]
        covered.append((ecosystem, target))
        for vuln in result.get("Vulnerabilities") or []:
            vid = vuln["VulnerabilityID"]
            findings.append(
                dependency(
                    "trivy",
                    ecosystem,
                    vuln["PkgName"],
                    vuln["InstalledVersion"],
                    target,
                    changed,
                    severity=tool_severity(vuln.get("Severity", "")),
                    title=f"{vid}: {vuln.get('Title') or ''}".rstrip(": "),
                    fixed=vuln.get("FixedVersion", ""),
                    ids=[vid, *(vuln.get("VendorIDs") or [])],
                )
            )
    return findings, covered


def json_stream(text: str) -> list[dict]:
    """Decode concatenated JSON objects, as govulncheck -json emits them."""
    decoder, objects, index = json.JSONDecoder(), [], 0
    while True:
        while index < len(text) and text[index].isspace():
            index += 1
        if index >= len(text):
            return objects
        obj, index = decoder.raw_decode(text, index)
        objects.append(obj)


def parse_govulncheck(
    text: str, module_dir: str, changed: set[str]
) -> tuple[list[Finding], str]:
    """Return one finding per advisory at its deepest reachability, plus the version."""
    prefix = "" if module_dir in {"", "."} else module_dir + "/"
    osvs, best, version = {}, {}, ""
    for message in json_stream(text):
        if "config" in message:
            version = message["config"].get("scanner_version", "")
        elif "osv" in message:
            osvs[message["osv"]["id"]] = message["osv"]
        elif "finding" in message:
            found = message["finding"]
            trace = found["trace"]
            level = (
                "called"
                if trace[0].get("function")
                else "imported"
                if trace[0].get("package")
                else "required"
            )
            current = best.get(found["osv"])
            if (
                current is None
                or REACHABILITY_RANK[level] < REACHABILITY_RANK[current[0]]
            ):
                best[found["osv"]] = (level, found, trace)
    lock_changed = {prefix + "go.mod", prefix + "go.sum"} & changed
    findings = []
    for osv_id, (level, found, trace) in best.items():
        osv = osvs.get(osv_id, {})
        reach = level
        site = trace[-1].get("position") if level == "called" else None
        if site:
            reach = f"called at {prefix}{site['filename']}:{site['line']}"
        finding = dependency(
            "govulncheck",
            "go",
            trace[0]["module"],
            trace[0].get("version", ""),
            prefix + "go.mod",
            changed,
            severity="unrated",
            title=f"{osv_id}: {osv.get('summary', '')}".rstrip(": "),
            fixed=found.get("fixed_version", ""),
            ids=[osv_id, *osv.get("aliases", [])],
            reachability=reach,
        )
        finding.changed_on_branch = bool(lock_changed)
        findings.append(finding)
    return findings, version


def parse_pip_audit(data: dict, target: str, changed: set[str]) -> list[Finding]:
    findings = []
    for dep in data.get("dependencies", []):
        for vuln in dep.get("vulns", []):
            findings.append(
                dependency(
                    "pip-audit",
                    "pypi",
                    dep["name"],
                    dep["version"],
                    target,
                    changed,
                    severity="unrated",
                    title=vuln["id"],
                    fixed=", ".join(vuln.get("fix_versions", [])),
                    ids=[vuln["id"], *vuln.get("aliases", [])],
                )
            )
    return findings


# --- merging and ordering ---


def merge_into(kept: Finding, other: Finding) -> None:
    kept.tool = "+".join(sorted(set(kept.tool.split("+")) | set(other.tool.split("+"))))
    rated = [s for s in (kept.severity, other.severity) if s != "unrated"]
    kept.severity = min(rated, key=SEVERITY_RANK.__getitem__) if rated else "unrated"
    kept.changed_on_branch = kept.changed_on_branch or other.changed_on_branch
    kept.fixed_version = kept.fixed_version or other.fixed_version
    kept.reachability = kept.reachability or other.reachability
    kept.snippet = kept.snippet or other.snippet
    kept.detail = kept.detail or other.detail
    kept.vuln_ids = sorted(set(kept.vuln_ids) | set(other.vuln_ids))


def dedupe(findings: list[Finding]) -> list[Finding]:
    """Merge the same secret seen twice, and the same advisory for one package."""
    kept: list[Finding] = []
    secrets: dict[str, Finding] = {}
    packages: dict[tuple[str, str, str], list[Finding]] = {}
    for finding in findings:
        if finding.category == "secret":
            match = secrets.get(finding.location)
            if match:
                merge_into(match, finding)
                continue
            secrets[finding.location] = finding
        elif finding.category == "dependency":
            key = (
                finding.ecosystem,
                normalize_package(finding.ecosystem, finding.package),
                normalize_version(finding.version),
            )
            group = packages.setdefault(key, [])
            match = next(
                (f for f in group if set(f.vuln_ids) & set(finding.vuln_ids)), None
            )
            if match:
                merge_into(match, finding)
                continue
            group.append(finding)
        kept.append(finding)
    return kept


def rank(findings: list[Finding]) -> list[Finding]:
    """Sort by severity, then branch changes first, and assign stable ids."""
    ordered = sorted(
        findings,
        key=lambda f: (SEVERITY_RANK[f.severity], not f.changed_on_branch, f.location),
    )
    for number, finding in enumerate(ordered, 1):
        finding.id = f"F{number}"
    return ordered
