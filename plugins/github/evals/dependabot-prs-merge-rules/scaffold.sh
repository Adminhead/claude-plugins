#!/usr/bin/env bash
set -euo pipefail
# Stub gh: fixture data in, every call logged to gh-calls.log, no network.
cat > gh <<'S'
#!/usr/bin/env bash
echo "gh $*" >> "$(dirname "$0")/gh-calls.log"
case "$1 $2" in
  "pr list") cat <<'J'
[{"number":11,"title":"Bump lodash from 4.17.20 to 4.17.21","headRefName":"dependabot/npm_and_yarn/lodash-4.17.21","mergeable":"MERGEABLE","statusCheckRollup":[{"name":"test","conclusion":"SUCCESS"}]},
 {"number":12,"title":"Bump requests from 2.31.0 to 2.32.0","headRefName":"dependabot/pip/requests-2.32.0","mergeable":"MERGEABLE","statusCheckRollup":[{"name":"test","conclusion":"FAILURE"}]}]
J
  ;;
  "pr view") case "$3" in
    11) echo '{"state":"OPEN","mergeable":"MERGEABLE","statusCheckRollup":[{"name":"test","conclusion":"SUCCESS"}]}' ;;
    *)  echo '{"state":"OPEN","mergeable":"MERGEABLE","statusCheckRollup":[{"name":"test","conclusion":"FAILURE"}]}' ;;
  esac ;;
  "repo view") echo '{"squashMergeAllowed":true,"mergeCommitAllowed":false,"rebaseMergeAllowed":false}' ;;
  "pr merge") echo "merged $3" ;;
  "pr checks") echo "test  fail" ; exit 1 ;;
  *) echo "stub gh: unsupported: $*" >&2 ; exit 1 ;;
esac
S
chmod +x gh
