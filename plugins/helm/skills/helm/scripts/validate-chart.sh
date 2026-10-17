#!/usr/bin/env bash
# Read-only chart check: lint, render per values file, schema-check the output.
# Usage: validate-chart.sh <chart-dir> [-f <values-file>]...
set -u

usage() {
  echo "Usage: $0 <chart-dir> [-f <values-file>]..." >&2
  echo "Runs helm lint --strict, renders the chart for the default values and each -f file," >&2
  echo "and validates the output with kubeconform when it is installed. Changes nothing." >&2
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ $# -lt 1 ]; then
  usage
  [ $# -lt 1 ] && exit 2
  exit 0
fi

chart=$1
shift
values=()
while [ $# -gt 0 ]; do
  case $1 in
    -f)
      [ $# -ge 2 ] || { usage; exit 2; }
      values+=("$2")
      shift 2
      ;;
    *) usage; exit 2 ;;
  esac
done

command -v helm >/dev/null 2>&1 || { echo "FAIL helm is not installed" >&2; exit 2; }
[ -f "$chart/Chart.yaml" ] || { echo "FAIL $chart/Chart.yaml not found" >&2; exit 2; }

failures=0
fail() { echo "FAIL $1"; failures=$((failures + 1)); }
pass() { echo "PASS $1"; }

# Each entry is a values file, or "" for the chart defaults.
sets=("")
[ ${#values[@]} -gt 0 ] && sets+=("${values[@]}")

for vf in "${sets[@]}"; do
  label=${vf:-chart defaults}
  vargs=()
  [ -n "$vf" ] && vargs=(-f "$vf")

  if helm lint --strict "$chart" ${vargs[@]+"${vargs[@]}"}; then
    pass "lint: $label"
  else
    fail "lint: $label"
    continue
  fi

  if ! rendered=$(helm template validate-release "$chart" ${vargs[@]+"${vargs[@]}"}); then
    fail "template: $label"
    continue
  fi
  pass "template: $label"

  if kubeconform -v >/dev/null 2>&1; then   # a version-manager shim can exist without a working binary
    if printf '%s\n' "$rendered" | kubeconform -strict -summary -ignore-missing-schemas; then
      pass "kubeconform: $label"
    else
      fail "kubeconform: $label"
    fi
  else
    echo "SKIP kubeconform not installed or not runnable ($label)"
  fi
done

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "All checks passed"
