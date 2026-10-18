#!/usr/bin/env bash
# Print mechanical facts about a repository README. Judgement stays with the caller.
# Usage: readme_audit.sh [repo-root | path/to/README.md]
#
# Read-only: it never writes, fetches or executes anything from the repository.
# Needs bash 3.2+, grep, sed, awk, wc, sort, uniq, tr, head, cut (BSD or GNU).
# Adapted from samber/developer-relations-skills (MIT) scripts/readme-audit.sh,
# with the image and SVG checks from oil-oil/beautify-github-readme (MIT)
# scripts/audit_readme.py.

set -uo pipefail

case "${1:-}" in
  -h|--help)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 0 ;;
esac

target="${1:-.}"
if [ -d "$target" ]; then
  repo="${target%/}"
  file=""
  for candidate in "$repo/.github/README.md" "$repo/README.md" "$repo/docs/README.md"; do
    [ -f "$candidate" ] || continue
    [ -z "$file" ] && file="$candidate"
  done
  if [ -f "$repo/.github/README.md" ] && [ -f "$repo/README.md" ]; then
    echo "SHADOWED: $repo/README.md is not shown on GitHub while .github/README.md exists, but registries and clones still use it"
  fi
  if [ -z "$file" ]; then echo "NO README FOUND under $repo (.github/, root, docs/)" >&2; exit 1; fi
else
  file="$target"
  [ -f "$file" ] || { echo "NOT A FILE: $file (expected a repo root or a README path)" >&2; exit 1; }
  repo="$(dirname "$file")"
  case "$repo" in */.github|*/docs|.github|docs) repo="$(dirname "$repo")" ;; esac
fi
base="$(dirname "$file")"

echo "FILE: $file"

bytes=$(wc -c < "$file" | tr -d ' ')
lines=$(wc -l < "$file" | tr -d ' ')
words=$(wc -w < "$file" | tr -d ' ')
echo "SIZE: ${bytes} bytes / ${lines} lines / ${words} words"
[ "$bytes" -gt 512000 ] && echo "WARNING: over 500 KiB; GitHub truncates the rendered view"

# Drop fenced code blocks so headings and links inside examples are not counted.
prose=$(awk '/^[[:space:]]*(```|~~~)/{f=!f; next} !f' "$file")

echo
echo "HEADINGS:"
printf '%s\n' "$prose" | grep -nE '^#{1,6} ' | sed 's/^/  /' || echo "  (none)"
section_count=$(printf '%s\n' "$prose" | grep -cE '^#{2,6} ')
echo "SECTION COUNT (h2-h6): $section_count   [sample median 7; half of READMEs have 5-12]"

echo
first_fence=$(grep -nE '^[[:space:]]*(```|~~~)' "$file" | head -1 | cut -d: -f1)
if [ -n "${first_fence:-}" ]; then
  pre_words=$(head -n "$((first_fence - 1))" "$file" | wc -w | tr -d ' ')
  echo "FIRST CODE BLOCK: line $first_fence, after $pre_words words"
else
  echo "FIRST CODE BLOCK: none; the reader never gets a copyable command"
fi

echo
badges=$(head -40 "$file" | grep -oE '!\[[^]]*\]\([^)]*(shields\.io|badge|badgen|codecov|coveralls|circleci|travis-ci|appveyor)[^)]*\)' | wc -l | tr -d ' ')
echo "BADGES IN FIRST 40 LINES: $badges"

md_noalt=$(printf '%s\n' "$prose" | grep -oE '!\[[[:space:]]*\]\(' | wc -l | tr -d ' ')
html_noalt=$(printf '%s\n' "$prose" | grep -oiE '<img[^>]*>' | grep -viE "alt=(\"[^\"]*[^\"[:space:]][^\"]*\"|'[^']*[^'[:space:]][^']*')" | wc -l | tr -d ' ')
echo "IMAGES WITHOUT ALT TEXT: markdown $md_noalt, html $html_noalt"

html_tags=$(printf '%s\n' "$prose" | grep -oE '<(picture|source|details|summary|img|div|table|br|p|h[1-6])([^[:alnum:]_]|$)' \
  | sed -E 's/[^[:alnum:]_]$//' | sort | uniq -c | tr -s ' ' | tr '\n' ' ')
echo "RAW HTML TAGS: ${html_tags:-none}   [registries and terminal readers may strip these]"

alerts=$(printf '%s\n' "$prose" | grep -cE '^>[[:space:]]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]')
echo "GITHUB ALERTS: $alerts   [GitHub advises one or two per document]"

resolve() {
  # $1 = link target as written; prints the local path it points at, or nothing for remote/anchor links.
  local link="$1" path
  case "$link" in http://*|https://*|mailto:*|data:*|\#*|"") return ;; esac
  path="${link%%#*}"; path="${path%%\?*}"
  [ -z "$path" ] && return
  path="${path//%20/ }"
  case "$path" in /*) printf '%s\n' "$repo$path" ;; *) printf '%s\n' "$base/$path" ;; esac
}

echo
echo "BROKEN RELATIVE LINKS AND IMAGES:"
broken=0
svgs=""
while IFS= read -r link; do
  resolved=$(resolve "$link")
  [ -z "$resolved" ] && continue
  if [ ! -e "$resolved" ]; then
    echo "  MISSING: $link"; broken=$((broken + 1))
  else
    case "$resolved" in *.svg|*.SVG) svgs="$svgs$resolved"$'\n' ;; esac
  fi
done < <(
  {
    printf '%s\n' "$prose" | grep -oE '\]\([^)]+\)' | sed -E 's/^\]\(//; s/\)$//; s/[[:space:]]+".*"$//; s/^<//; s/>$//'
    printf '%s\n' "$prose" | grep -oiE '(src|srcset|href)="[^"]+"' | sed -E 's/^[^"]*"//; s/"$//; s/[[:space:]].*$//'
  } | sort -u
)
[ "$broken" -eq 0 ] && echo "  (none)"

if [ -n "$svgs" ]; then
  echo
  echo "LOCAL SVG CHECKS:"
  while IFS= read -r svg; do
    [ -z "$svg" ] && continue
    issues=""
    grep -qiE '<script' "$svg" && issues="$issues <script> (stripped);"
    grep -qi 'foreignObject' "$svg" && issues="$issues foreignObject (not rendered);"
    grep -q 'viewBox' "$svg" || issues="$issues no viewBox;"
    grep -qiE '<title' "$svg" || issues="$issues no <title>;"
    grep -qiE '<animate|@keyframes' "$svg" && issues="$issues animation (GitHub shows a static frame);"
    echo "  ${svg#"$repo"/}: ${issues:- ok}"
  done <<< "$svgs"
fi

echo
echo "CONTENT CATEGORIES (heading heuristic):"
check() {
  if printf '%s\n' "$prose" | grep -qiE "^#{1,6} .*($2)"; then echo "  $1: yes"; else echo "  $1: not found"; fi
}
check "What (intro/overview)"     "intro|about|overview|what is|description"
check "Why (differentiation)"     "why|motivation|compar|alternativ|advantage|when to use|trade-?off"
check "How (install/usage)"       "install|usage|getting started|quick ?start|setup|configur|requirement|example|cli|command"
check "When (status/roadmap)"     "status|roadmap|version|stability|maturity|release|limitation|known issue"
check "Who (licence/maintainers)" "licen[cs]e|maintainer|author|credit|acknowledg|contact"
check "References (docs/support)" "document|docs|support|faq|resource|related|see also|learn more"
check "Contribution"              "contribut|development|hacking"
echo "  [a missing heading is a question, not a verdict: the content may sit under another title]"

echo
placeholders=$(grep -niE 'TODO|FIXME|coming soon|lorem ipsum|<your[ -]|placeholder|\[insert |OWNER/REPO' "$file" | head -10)
if [ -n "$placeholders" ]; then echo "PLACEHOLDERS:"; printf '%s\n' "$placeholders" | sed 's/^/  /'; else echo "PLACEHOLDERS: none"; fi

toc=$(printf '%s\n' "$prose" | grep -inE '^#{1,6} .*(table of contents|contents)[[:space:]]*$' | head -1)
[ -n "$toc" ] && echo "HAND-WRITTEN TOC: $toc   [GitHub's Outline button already lists headings]"

exit 0
