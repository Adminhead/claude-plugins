#!/usr/bin/env python3
"""List the package manifests, CI configs, and container files in a repository.

Read-only and standard library only. Prints paths relative to the repo root,
grouped by kind, at most MAX_DEPTH directories deep, at most MAX_PER_KIND per kind, and skips vendored and
generated directories. It reports where to look, not what the files mean.
"""

import argparse
import fnmatch
import json
import os
import sys

MAX_DEPTH = 3
MAX_PER_KIND = 40
SKIP_DIRS = {".git", "node_modules", "vendor", "venv", ".venv", "dist", "build", "target",
             "__pycache__", ".next", "coverage", ".terraform", "site-packages"}

KINDS = {
    "manifest": ["package.json", "pyproject.toml", "requirements*.txt", "Pipfile", "setup.py",
                 "go.mod", "Cargo.toml", "pom.xml", "build.gradle*", "Gemfile", "composer.json",
                 "mix.exs", "pubspec.yaml", "*.csproj", "deno.json", "bun.lock*", "flake.nix",
                 "devenv.nix", "Makefile", "justfile"],
    "container": ["Dockerfile*", "docker-compose*.y*ml", "compose*.y*ml", "*.dockerignore",
                  "Chart.yaml", "kustomization.y*ml"],
}
CI_DIRS = (".github/workflows", ".gitlab-ci", ".circleci", ".buildkite")
CI_FILES = [".gitlab-ci.yml", "Jenkinsfile", "azure-pipelines.yml", ".travis.yml", "bitbucket-pipelines.yml"]


def scan(root):
    found = {"manifest": [], "ci": [], "container": []}
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        depth = 0 if rel_dir == "." else rel_dir.count(os.sep) + 1
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and depth < MAX_DEPTH]
        for name in filenames:
            rel = os.path.normpath(os.path.join(rel_dir, name))
            in_ci_dir = any(rel.startswith(d) for d in CI_DIRS)
            if name in CI_FILES or (in_ci_dir and fnmatch.fnmatch(name, "*.y*ml")):
                found["ci"].append(rel)
            for kind in ("manifest", "container"):
                if any(fnmatch.fnmatch(name, pat) for pat in KINDS[kind]):
                    found[kind].append(rel)
    return {kind: sorted(set(paths)) for kind, paths in found.items()}


def capped(found):
    """Limit each kind to MAX_PER_KIND paths and say how many were left out."""
    out = {}
    for kind, paths in found.items():
        out[kind] = paths[:MAX_PER_KIND]
        if len(paths) > MAX_PER_KIND:
            out[kind].append(f"... and {len(paths) - MAX_PER_KIND} more")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("repo", nargs="?", default=".", help="repository root (default: current directory)")
    parser.add_argument("--json", action="store_true", help="print JSON instead of text")
    args = parser.parse_args()
    if not os.path.isdir(args.repo):
        print(f"error: not a directory: {args.repo}", file=sys.stderr)
        return 2
    found = capped(scan(args.repo))
    if args.json:
        json.dump(found, sys.stdout, indent=2)
        print()
    else:
        for kind, paths in found.items():
            print(f"{kind}:")
            for path in paths:
                print(f"  {path}")
            if not paths:
                print("  (none)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
