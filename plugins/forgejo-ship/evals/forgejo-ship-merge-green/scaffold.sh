#!/usr/bin/env bash
set -euo pipefail
# Local repo whose "forgejo" remote points at codeberg.org (redirected to a local
# bare repo so push works offline), plus a stub fj: fixture data in, every call
# logged to fj-calls.log, no network.
git init -q -b main .
git config user.email eval@example.com
git config user.name Eval
echo "retry = 1" > app.conf
git add app.conf
git commit -qm "chore: initial"
git init -q --bare .git/fake-remote.git
git remote add forgejo https://codeberg.org/acme/widgets.git
git config url."$PWD/.git/fake-remote.git".insteadOf https://codeberg.org/acme/widgets.git
git push -q forgejo main
git remote set-head forgejo main
git checkout -q -b fix/retry
echo "retry = 3" > app.conf
cat > fj <<'S'
#!/usr/bin/env bash
echo "fj $*" >> "$(dirname "$0")/fj-calls.log"
args=" $* "
case "$args" in
  *" whoami "*) echo "tester at codeberg.org" ;;
  *" search "*) ;;
  *" create "*) echo "Created pull request #7: https://codeberg.org/acme/widgets/pulls/7" ;;
  *" view "*) echo "#7 fix retry (open) fix/retry -> main" ;;
  *" status "*) printf 'PR #7: open, mergeable\nci/test: success\nci/lint: success\n' ;;
  *" merge "*) echo "merged" ;;
  *) echo "stub fj: unsupported: $*" >&2 ; exit 1 ;;
esac
S
chmod +x fj
printf 'fj\nfj-calls.log\n' >> .git/info/exclude
