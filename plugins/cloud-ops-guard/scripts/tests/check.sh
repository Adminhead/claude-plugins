#!/usr/bin/env bash
# Offline tests for scripts/cloud-ops-guard.ts: feeds PreToolUse JSON, checks the decision.
set -u

scripts=$(cd "$(dirname "$0")/.." && pwd)
script=$scripts/cloud-ops-guard.ts
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

pass=0 fail=0
ok() { pass=$((pass + 1)); echo "ok   $1"; }
bad() { fail=$((fail + 1)); echo "FAIL $1 (expected $2, got $3)"; }

# Every case runs against a kubeconfig fixture: the guard never reads ~/.kube. kubecfg picks the fixture.
printf 'apiVersion: v1\nkind: Config\ncurrent-context: omni-prod\n' >"$root/kube-prod.yaml"
printf 'apiVersion: v1\nkind: Config\ncurrent-context: omni-dev\n' >"$root/kube-dev.yaml"
{ head -c 2000000 /dev/zero | tr '\0' '#'; printf '\ncurrent-context: omni-prod\n'; } >"$root/kube-big.yaml"
{ printf 'current-context: omni-prod\n'; head -c 2000000 /dev/zero | tr '\0' '#'; printf '\n'; } >"$root/kube-bigfirst.yaml"
printf 'current-context: omni-prod\n' >"$root/cfg-a.yaml"
printf 'current-context: omni-dev\n' >"$root/cfg-b.yaml"
mkdir -p "$root/.kube"
printf 'current-context: omni-dev\n' >"$root/.kube/dev.yaml"
mkfifo "$root/kube-fifo.yaml"
kubecfg=$root/kube-dev.yaml
# The plugin options default off; auto=true and prodpat=<regex> set them for one case.
unset CLAUDE_PLUGIN_OPTION_AUTOALLOWREADONLY CLAUDE_PLUGIN_OPTION_PRODPATTERN
auto='' prodpat=''
# HOME is the test root too, so a ~/ kubeconfig path in a command resolves to a fixture.
guard() {
  HOME=$root KUBECONFIG=${kubecfg:-$root/kube-dev.yaml} CLAUDE_PLUGIN_OPTION_AUTOALLOWREADONLY=${auto:-false} \
    CLAUDE_PLUGIN_OPTION_PRODPATTERN=${prodpat:-} bun --no-env-file --config=/dev/null "$script"
}

# The walker copies must match the canonical copy in scripts/shared byte for byte, when this
# plugin sits in the marketplace checkout. Installed alone, the check is skipped.
canon=$scripts/../../../scripts/shared
for f in shell/walk.ts vendor/unbash.js vendor/unbash.d.ts; do
  if [ ! -f "$canon/$f" ]; then
    echo "skip scripts/$f (no scripts/shared copy in this checkout)"
  elif cmp -s "$scripts/$f" "$canon/$f"; then
    ok "scripts/$f matches scripts/shared"
  else
    bad "scripts/$f matches scripts/shared" "identical" "differs"
  fi
done

# Subagent transcript fixtures: <root>/proj/<sid>/subagents/agent-<id>.jsonl
sid=11111111-2222-3333-4444-555555555555
mkdir -p "$root/proj/$sid/subagents"
python3 - "$root" "$sid" <<'EOF'
import json, sys
root, sid = sys.argv[1:]
def user(content, meta=False):
    msg = {"type": "user", "message": {"role": "user", "content": content}}
    return {**msg, "isMeta": True} if meta else msg
result = user([{"type": "tool_result", "tool_use_id": "t1", "content": "ALLOW: cloud-ops"}])
def w(aid, *lines):
    with open(f"{root}/proj/{sid}/subagents/agent-{aid}.jsonl", "w") as f:
        f.writelines(json.dumps(line) + "\n" for line in lines)
w("withtoken", user("Do the thing.\nALLOW: cloud-ops\nThanks."))
w("notoken", user("Do the thing. ALLOW: cloud-ops inline is not a whole line."))
w("listtoken", user([{"type": "text", "text": "ALLOW: cloud-ops"}]))
w("metatoken", user("Skill text.\nALLOW: cloud-ops", meta=True), result)
w("metabrief", user("[SYSTEM NOTIFICATION]", meta=True), user("Brief.\nALLOW: cloud-ops"))
w("metanotoken", user("ALLOW: cloud-ops", meta=True), user("Brief without the marker."))
w("bigline", user("x" * (1 << 20) + "\nALLOW: cloud-ops"))
EOF

decision() { # stdin JSON -> decision word or "none"
  local out
  out=$(guard 2>/dev/null)
  rc=$?
  [ $rc -eq 0 ] || { echo "rc$rc"; return; }
  [ -z "$out" ] && { echo none; return; }
  printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin)["hookSpecificOutput"]["permissionDecision"])'
}

mkin() { # command [agent_id]
  python3 - "$1" "${2:-}" "$root" "$sid" <<'EOF'
import json, sys
cmd, aid, root, sid = sys.argv[1:]
d = {"tool_name": "Bash", "tool_input": {"command": cmd}, "session_id": sid,
     "transcript_path": f"{root}/proj/{sid}.jsonl"}
if aid:
    d["agent_id"] = aid
print(json.dumps(d))
EOF
}

t() { # name expected command [agent_id]
  local got
  got=$(mkin "$3" "${4:-}" | decision)
  if [ "$got" = "$2" ]; then ok "$1"; else bad "$1" "$2" "$got"; fi
}
why() { # name reason-substring command [agent_id]
  local got
  got=$(mkin "$3" "${4:-}" | guard 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["hookSpecificOutput"]["permissionDecisionReason"])' 2>/dev/null)
  case $got in *"$2"*) ok "$1" ;; *) bad "$1" "reason with '$2'" "$got" ;; esac
}
raw() { # name expected raw-stdin
  local got
  got=$(printf '%s' "$3" | decision)
  if [ "$got" = "$2" ]; then ok "$1"; else bad "$1" "$2" "$got"; fi
}

# Safe forms: the strict allowlist. With the default options the guard has no opinion on them;
# the autoAllowReadOnly block below checks that they allow when the option is on.
t "plan" none "tofu plan"
t "plan -out" none "tofu plan -out=x.tfplan"
t "plan -out=tfplan" none "tofu plan -out=tfplan"
t "validate" none "terraform validate"
t "fmt" none "tofu fmt -recursive"
t "init" none "tofu init -upgrade"
t "output -json prompts (prints secrets)" ask "tofu output -json"
t "state list" none "tofu state list"
t "state show" none "tofu state show aws_instance.a"
t "apply saved plan prompts" none "tofu apply x.tfplan"
t "apply saved plan named tfplan prompts" none "tofu apply tfplan"
t "apply saved plan in a directory prompts" none "tofu apply plans/x.tfplan"
t "apply saved plan with lock timeout prompts" none "tofu apply -lock-timeout=60s x.tfplan"
t "chdir apply saved plan prompts" none "tofu -chdir=infra apply x.tfplan"
t "version flag" none "tofu --version"
t "aws --version" none "aws --version"
t "aws help" none "aws ec2 help"
t "aws operation help" none "aws iam delete-user help"

# Outside the exact grammar: never allow
t "apply saved plan with -auto-approve" deny "tofu apply -auto-approve -lock-timeout=60s x.tfplan"
t "apply saved plan with another flag gets no allow" none "tofu apply -lock=false x.tfplan"
t "plan -out to a non-plan file gets no allow" none "tofu plan -out=terraform.tfstate"
t "plan with a separate value word gets no allow" none "tofu plan -var x=1"
t "double space gets no allow" none "tofu  plan"
t "terragrunt plan gets no allow" none "terragrunt plan"
t "mise env word with a path gets no allow" none "mise run tofu ../x plan"
t "mise run flags get no allow" none "mise run --quiet tofu core output x"
t "init -migrate-state" ask "tofu init -migrate-state -force-copy"
t "plan -generate-config-out" ask "tofu plan -generate-config-out=x.tf"
t "state show -show-sensitive" ask "mise run tofu core state show -show-sensitive module.x"

# Deny
t "apply interactive" deny "tofu apply"
t "apply -auto-approve" deny "tofu apply -auto-approve"
t "apply -target no plan" deny "tofu apply -target=aws_instance.a"
t "apply -var value is not a plan" deny "tofu apply -var x=1"
t "apply -var-file value is not a plan" deny "tofu apply -var-file x.tfplan"
t "apply -auto-approve after the plan" deny "tofu apply x.tfplan -auto-approve"
t "apply -auto-approve=true" deny "tofu apply -auto-approve=true x.tfplan"
t "apply --auto-approve" deny "tofu apply --auto-approve x.tfplan"
t "apply -destroy saved plan" deny "tofu apply -destroy x.tfplan"
t "destroy" deny "tofu destroy"
t "import" deny "tofu import aws_instance.a i-123"
t "state rm" deny "tofu state rm aws_instance.a"
t "state mv" deny "tofu state mv a b"
t "state push" deny "tofu state push terraform.tfstate"
t "state replace-provider" deny "tofu state replace-provider a b"
t "terragrunt apply" deny "terragrunt apply"
t "terragrunt run --all apply" deny "terragrunt run --all -- apply"
t "terragrunt run-all destroy" deny "terragrunt run-all destroy"
t "terraform destroy" deny "terraform destroy -auto-approve"
t "stderr redirect does not look like a plan" deny "tofu apply 2>&1"
t "mise run tofu env state rm" deny "mise run tofu core state rm module.x"
t "state show of a quoted indexed address" none "tofu state show 'aws_instance.a[0]'"
t "state show with a redirect" none "mise run tofu core state show module.x 2>&1"

# Review bypasses: each once returned allow
t "glued ;newline" none $'tofu plan;\nrm -rf $HOME/x'
t "glued ;newline sudo" none $'tofu plan;\nsudo rm -rf /x'
t "glued ;( aws" ask "tofu plan;(aws s3 rb s3://x --force)"
t "glued ;( aws in a subagent" deny "tofu plan;(aws s3 rb s3://x --force)" notoken
t "glued &&(" deny "tofu plan &&(tofu apply -auto-approve)"
t "glued );" deny "(tofu plan);tofu destroy -auto-approve"
t "clobber redirect" ask "tofu plan >| terraform.tfstate"
t "apply operand ." deny "tofu apply -auto-approve ."
t "apply -destroy operand" deny "tofu apply -auto-approve -destroy foo"
t "apply -destroy -exclude" deny "tofu apply -auto-approve -destroy -exclude aws_instance.keep"
t "apply comment operand" deny "tofu apply -auto-approve #x.tfplan"
t "apply comment operand alone" deny "tofu apply #x.tfplan"
t "apply parameter default" deny 'tofu apply ${X:--auto-approve}'
t "apply ANSI-C quoted flag" deny "tofu apply \$'-auto-approve'"
t "apply --target" deny "tofu apply -auto-approve --target a.b"
t "apply --var" deny "tofu apply -auto-approve --var x=1"
t "terragrunt apply --working-dir" deny "terragrunt apply -auto-approve --working-dir live"
t "terragrunt run --all apply operand" deny "terragrunt run --all apply -auto-approve x"
t "chdir apply operand" deny "tofu -chdir=/prod apply -auto-approve ."
t "mise run tofu env apply operand" deny "mise run tofu core apply -auto-approve ."
t "flag value hides subcommand" deny "terragrunt --working-dir plan destroy -auto-approve"
t "mise ::: chains tasks" deny "mise run tofu core plan ::: tofu core apply -auto-approve"
t "mise ::: after another task" deny "mise run lint ::: tofu core apply -auto-approve"
t "aws help as a value" deny "aws iam delete-user --user-name help" notoken
t "aws help after force" deny "aws s3 rb s3://x --force help" notoken
t "aws help as a value, main session" ask "aws iam delete-user --user-name help"
t "env --split-string" ask "env --split-string='sh -c \"id\"' tofu plan"
t "env -S" ask "env -S 'sh -c id' tofu plan"

# Heredocs: quoted or inert bodies are data, not commands
t "heredoc doc with destroy" none $'cat > docs/runbook.md <<\'EOF\'\ntofu destroy -auto-approve\nEOF'
t "heredoc doc via mise" none $'cat > x.md <<\'EOF\'\nmise run tofu core destroy -auto-approve\nEOF'
t "heredoc commit message" none $'git commit -m "$(cat <<\'EOF\'\nrun tofu destroy -auto-approve later\nEOF\n)"'
t "heredoc <<- with tabs" none $'cat > x <<-EOF\n\ttofu destroy\n\tEOF'
t "two heredocs" none $'cat > a.md <<\'A\'\ntofu destroy\nA\ncat > b.md <<\'B\'\ntofu import x y\nB'
t "heredoc piped to sh" ask $'cat <<EOF | sh\ntofu apply\nEOF'
t "heredoc with plan piped to sh" ask $'cat <<EOF | sh\ntofu plan\nEOF'
t "heredoc into bash" ask $'bash <<EOF\ntofu plan\nEOF'
t "quoted heredoc into bash" ask $'bash <<\'EOF\'\ntofu plan\nEOF'
t "heredoc into python" ask $'python3 - <<\'EOF\'\nimport subprocess; subprocess.run(["tofu", "destroy"])\nEOF'
t "unquoted heredoc runs a substitution" deny $'cat <<EOF\n$(tofu destroy -auto-approve)\nEOF'
t "unterminated heredoc is parsed" deny $'cat > x.md <<\'EOF\'\ntofu destroy -auto-approve'
t "heredoc then real apply" deny $'cat > x.md <<\'EOF\'\nnotes\nEOF\ntofu apply -auto-approve'
t "here-string is not a heredoc" ask "tofu console <<< 'local.x'"
t "<< in double quotes is not a heredoc" deny $'echo "use <<EOF here"\nmise run tofu core destroy -auto-approve\nEOF'
t "<< in single quotes is not a heredoc" deny $'echo \'x <<EOF y\'\ntofu destroy\nEOF'
t "<< in a multi-line string is not a heredoc" deny $'echo "start\n<<EOF here"\ntofu destroy\nEOF'

# Wrappers and prefixes
t "VAR= prefix apply" deny "AWS_PROFILE=x tofu apply -auto-approve"
t "VAR= prefix plan gets no allow" none "AWS_PROFILE=x TF_LOG=0 tofu plan"
t "env wrapper" deny "env TF_IN_AUTOMATION=1 tofu apply"
t "sudo wrapper" deny "sudo -u root tofu destroy"
t "absolute path" deny "/usr/local/bin/tofu apply -auto-approve"
t "quote-split tool name" deny "t'o'fu apply -auto-approve"
t "line-continued tool name" deny $'tof\\\nu apply -auto-approve'
t "mise exec" deny "mise exec -- tofu apply -auto-approve"
t "mise exec plan" none "mise exec -- tofu plan"
t "mise exec -c" ask "mise exec -c 'tofu apply -auto-approve'"
t "mise run flag with a value" deny "mise run -j 4 tofu core apply -auto-approve"
t "mise run tofu env plan" none "mise run tofu core plan"
t "mise run tofu env plan -out" none "mise run tofu core plan -out=uptimekuma.tfplan"
t "mise run tofu env apply saved" none "mise run tofu core apply uptimekuma.tfplan"
t "mise run tofu env apply -auto-approve" deny "mise run tofu authentik apply -auto-approve"
t "mise run tofu env destroy" deny "mise run tofu lab destroy"
t "mise run tofu without env gets no allow" none "mise run tofu plan"
t "mise run tofu env taint" ask "mise run tofu core taint module.x"
t "mise run tofu env init -migrate-state" ask "mise run tofu core init -migrate-state -force-copy"

# Wrappers Claude Code strips before matching allow rules
t "timeout" deny "timeout 30 mise run tofu core apply -auto-approve"
t "timeout with options" deny "timeout -s KILL 30 tofu destroy"
t "nice -n" deny "nice -n 10 tofu apply -auto-approve"
t "stdbuf" deny "stdbuf -oL tofu destroy"
t "noglob" deny "noglob tofu apply"
t "command" deny "command tofu apply -auto-approve"
t "command -v is a lookup" none "command -v tofu"
t "time -p" deny "time -p tofu destroy"
t "xargs feeds apply" ask "echo -auto-approve | xargs mise run tofu core apply"
t "if/then body" deny "if tofu validate; then tofu apply -auto-approve; fi"
t "loop body in a subshell" deny 'for d in a b; do (cd $d && tofu apply); done'
t "function body" deny "f() { tofu destroy -auto-approve; }; f"

# Commands the guard does not know
t "unknown wrapper" deny "op run -- tofu apply -auto-approve"
t "unknown option cluster" deny "sudo -iu root tofu destroy"
t "echo with a dangerous tool call" ask "echo tofu apply"
t "variable as the command" ask 'X=tofu; $X destroy'
t "eval of a variable" ask "CMD='tofu destroy'; eval \"\$CMD\""
t "variable in tool arguments" none 'tofu -chdir=$PWD/infra plan'
t "variable as the subcommand" deny 'S=destroy; tofu $S'
t "quoted braced variable as the subcommand" deny 'tofu "${SUB}" -auto-approve'
t "variable subcommand under terragrunt" deny 'terragrunt run-all $S'
t "substitution as the subcommand" deny 'tofu `echo destroy`'
t "variable as the state verb" deny 'V=rm; tofu state "$V" x'
t "substitution as the state verb" deny 'tofu state $(echo rm) x'
t "variable state address stays quiet" none 'tofu state show $ADDR'

# Compound, quoted, and constructs
t "plan; apply" deny "tofu plan;tofu apply -auto-approve"
t "&& apply" deny "cd infra && tofu apply -auto-approve"
t "|| apply" deny "tofu validate || tofu apply"
t "pipe apply" deny "yes | tofu apply"
t "newline apply" deny $'tofu plan\ntofu apply'
t "background apply" deny "tofu plan & tofu apply"
t "compound plans get no allow" none "tofu plan && tofu plan -out=a.tfplan"
t "plan with unchecked segment" none "cd infra && tofu plan"
t "plan piped to tail" none "tofu plan | tail -20"
t "plan with redirect" none "tofu plan > out.txt"
t "plan 2>&1 no allow" none "tofu plan 2>&1"
t "quoted separator is one word" none "echo 'tofu apply; tofu destroy'"
t "quoted arg gets no allow" none "tofu plan -var 'a=b;c'"
t "\$() apply (deny outranks ask)" deny "echo \$(tofu apply -auto-approve)"
t "backticks" ask 'echo `tofu plan`'
t "\$() in args" ask 'tofu plan -var "x=$(date)"'
t "bash -c" deny "bash -c 'tofu apply -auto-approve'"
t "eval" deny 'eval "tofu apply"'
t "xargs" ask "echo plan | xargs tofu"
t "unparseable quote" ask "tofu plan 'oops"
t "unknown subcommand" ask "tofu frobnicate"
t "state pull" ask "tofu state pull"
t "taint" ask "tofu taint aws_instance.a"
t "show reads a plan" none "tofu show x.tfplan"
t "show -json prints values" ask "tofu show -json x.tfplan"
t "\$() with plan" ask "echo \$(tofu plan)"

# Forms the shell AST walker sees: substitutions, nested shells, heredocs, wrappers
t "quoted substitution" deny 'echo "$(tofu destroy)"'
t "assignment substitution" deny 'x=$(tofu apply -auto-approve); echo $x'
t "substitution in an argument" deny 'echo "state: $(tofu state rm aws_instance.a)"'
t "process substitution" deny 'diff <(tofu destroy) /dev/null'
t "substitution inside a function" deny 'f() { echo "$(terraform import a b)"; }; f'
t "bash -c with a chain" deny 'bash -c "cd infra && tofu destroy"'
t "bash -lc bundled flags" deny "bash -lc 'tofu destroy'"
t "sh -c under sudo" deny "sudo bash -c 'terraform apply'"
t "nested shells" deny "bash -c \"sh -c 'tofu destroy'\""
t "bash -c with a safe plan still asks" ask "bash -c 'tofu plan'"
t "eval of a destroy" deny "eval 'tofu destroy -auto-approve'"
t "eval with joined words" deny 'eval tofu apply -auto-approve'
t "bash -c with a variable still asks" ask 'bash -c "tofu $ACTION"'
t "bash -c unparseable script" ask "bash -c 'tofu apply \"oops'"
t "heredoc into sh with apply" ask $'sh <<\'EOF\'\ntofu apply -auto-approve\nEOF'
t "heredoc backticks run" deny $'cat <<EOF\n`tofu destroy -auto-approve`\nEOF'
t "heredoc in a substitution runs" deny $'echo "$(cat <<EOF\n$(tofu destroy)\nEOF\n)"'
t "heredoc substitution beside an apply" deny $'cat <<EOF | sh\n$(date)\ntofu apply -auto-approve\nEOF'
t "heredoc substitution beside a destroy" deny $'cat <<EOF > x.sh\n$(date)\ntofu destroy\nEOF'
t "heredoc substitution beside a plan" ask $'cat <<EOF | sh\n$(date)\ntofu plan\nEOF'
t "heredoc with a final apply" deny $'cat <<\'EOF\' > x.md\nnotes\nEOF\ntofu apply'
t "earlier line ends with the heredoc body: destroy" deny $'tofu destroy\ncat <<\'E\'\nofu destroy\nE'
t "earlier line ends with the heredoc body: apply" deny $'tofu apply -auto-approve\ncat > notes.md <<\'EOF\'\nofu apply -auto-approve\nEOF'
t "earlier line ends with the heredoc body: state rm" deny $'terraform state rm aws_instance.a\ncat <<\'E\'\nerraform state rm aws_instance.a\nE'
t "earlier line ends with an unquoted heredoc body" deny $'tofu destroy\ncat <<E\nofu destroy\nE'
t "earlier line ends with the heredoc body: subagent aws" deny $'aws s3 rm s3://b --recursive\ncat <<\'E\'\nws s3 rm s3://b --recursive\nE' notoken
t "continuation hides the tool name: destroy" deny $'true\nt\\\nofu destroy\ncat <<\'E\'\nofu destroy\nE'
t "continuation hides the tool name, first line" deny $'t\\\nofu destroy\ncat <<\'E\'\nofu destroy\nE'
t "continuation hides the tool name, unquoted delimiter" deny $'t\\\nofu destroy\ncat <<E\nofu destroy\nE'
t "continuation inside the heredoc body" deny $'true\nt\\\nofu destroy\ncat <<\'E\'\nt\\\nE'
t "continuation after to" deny $'true\nto\\\nfu destroy\ncat <<\'E\'\nto\\\nE'
t "continuation: subagent aws" deny $'a\\\nws s3 rm s3://x\ncat <<\'E\'\nws s3 rm s3://x\nE' notoken
t "piped to sudo sh" ask "echo '\$(tofu destroy)' | sudo sh"
t "piped to sudo -u root bash" ask "echo 'tofu destroy' | sudo -u root bash"
t "piped to env bash" ask "echo 'tofu destroy' | env bash"
t "piped to env -i sh" ask "echo 'tofu destroy' | env -i sh"
t "piped to command sh" ask "echo 'tofu destroy' | command sh"
t "piped to exec sh" ask "echo 'tofu destroy' | exec sh"
t "piped to timeout 5 sh" ask "echo 'tofu destroy' | timeout 5 sh"
t "piped to nohup bash" ask "echo 'tofu destroy' | nohup bash"
t "piped to nice sh" ask "echo 'tofu destroy' | nice sh"
t "piped through tee to sh" ask "echo 'tofu destroy' | tee f | sh"
t "piped through cat to bash" ask "echo 'tofu destroy' | cat | bash"
t "piped to xargs sh" ask "echo 'tofu destroy' | xargs sh"
t "piped to busybox sh" ask "echo 'tofu destroy' | busybox sh"
t "substitution text piped to sh" ask "echo '\$(tofu destroy)' | sh"
t "backtick text piped to bash" ask "printf %s '\`tofu destroy\`' | bash"
t "tool output piped to sh" none "tofu validate | sh"
t "tool named only in a for list" ask 'for t in tofu; do $t destroy; done'
t "case arm" deny $'case $x in a) tofu destroy ;; esac'
t "while body" deny 'while true; do tofu apply; done'
t "wrappers chained" deny "timeout 5 sudo -u x env A=1 nice -n 5 tofu destroy"
t "env -i" deny "env -i PATH=/bin tofu apply -auto-approve"
t "time with a format" deny "time -f %e tofu destroy"
t "path-qualified tool in a substitution" deny 'echo $(/opt/bin/terraform destroy)'
t "aws behind a substitution, main session" ask 'echo $(aws s3 ls)'
t "aws behind a substitution, subagent" deny 'echo $(aws s3 ls)' notoken
t "aws in bash -c, subagent" deny "bash -c 'aws s3 rm s3://x --recursive'" notoken
t "aws behind wrappers, subagent" deny "timeout 5 nohup aws s3 ls" notoken
t "aws in a heredoc fed to a shell" ask $'bash <<EOF\naws s3 rb s3://x --force\nEOF'
t "quoted substitution in an arithmetic subscript is a parse error" ask "echo \$(( a['\$(id)'] )); tofu destroy"
t "zsh-only expansion is a parse error" ask 'echo $=x; tofu plan'
t "tool name only in a quoted heredoc passed to cat" none $'cat <<\'EOF\' | tee x.md\ntofu destroy\nEOF'
t "tool name in a quoted string" none "echo 'run tofu destroy later'"
t "commit message heredoc with tool name and a substitution elsewhere" none $'git commit -m "$(cat <<\'EOF\'\nfix aws stuff\nEOF\n)" --author "$(whoami) <a@b>"'

# Precision: heredocs to non-shell commands, unrelated substitutions, literal shell and interpreter scripts
t "doc heredoc then git add ." none $'cat > docs/x.md <<\'EOF\'\nrun tofu plan\nEOF\ngit add .'
t "python heredoc writes a doc that names a tool" none $'python3 - <<\'EOF\'\nopen(\'docs/a.md\',\'w\').write(\'tofu plan\')\nEOF'
t "python heredoc runs a subprocess" ask $'python3 - <<\'EOF\'\nimport subprocess; subprocess.run([\'tofu\',\'destroy\'])\nEOF'
t "heredoc into bash, plan" ask $'bash <<\'EOF\'\ntofu apply\nEOF'
t "heredoc into bash behind env" ask $'env X=1 bash <<\'EOF\'\ntofu plan\nEOF'
t "heredoc into ssh" ask $'ssh host <<\'EOF\'\ntofu plan\nEOF'
t "saved-plan apply then an unrelated loop substitution" none 'mise run tofu omni apply -no-color tfplan; for i in $(seq 1 15); do sleep 1; done'
t "date substitution feeds an aws read" none 'S=$(date -u -d "-6 hours" +%FT%TZ); aws cloudwatch get-metric-statistics --namespace AWS/RDS --start-time $S'
t "aws read-only inside a substitution" none 'RID=$(aws rds describe-db-instances --output text)'
t "aws read-only inside a substitution, subagent" deny 'RID=$(aws rds describe-db-instances)' notoken
t "aws describe with a global flag in a substitution" none 'X=$(aws --profile p --region r ec2 describe-instances)'
t "aws mutating inside a substitution" ask 'X=$(aws ec2 terminate-instances --instance-ids i-1)'
t "aws op from a substitution" ask 'aws ec2 $(echo terminate-instances) --instance-ids i-1'
t "aws service from a substitution" ask 'aws $(echo ec2) terminate-instances'
t "aws options in a variable, read-only op in a substitution" none 'P="--profile p --region r"; X=$(aws $P lambda list-versions-by-function --function-name f)'
t "literal bash -c script with a substitution" none 'timeout 240 bash -c "until [ \$(curl -s localhost/x | wc -l) -ge 7 ]; do sleep 10; done"; tofu fmt -check'
t "python -c literal code, expansion in a later argument" none 'for f in a b; do python3 -I -c "import json,sys; json.load(open(sys.argv[1]))" $f.json; done; tofu validate'
t "python script file with an expansion argument" none 'python3 gen.py $X; tofu validate'
t "bash script operand is a variable" ask 'S=/tmp/x.sh; bash $S 153; tofu validate'
t "bash -c with a variable code" ask 'X="tofu apply -auto-approve"; bash -c "$X"'
t "python -c with a variable code" ask 'python3 -c "$CODE"; tofu validate'
t "python -m with a variable module" ask 'python3 -m $M; tofu validate'
t "node -e with a tool name" ask 'node -e "require(\"child_process\").execSync(\"tofu plan\")"'
t "ssh with a variable stays ask" ask 'ssh h "$C"; tofu plan'
t "eval with an unrelated variable stays ask" ask 'eval "$C"; tofu plan'
t "xargs with a variable stays ask" ask 'echo a | xargs echo $X; tofu plan'
t "substitution as tofu subcommand" deny 'tofu $(echo destroy)'
t "substitution around an apply" deny 'echo $(tofu apply -auto-approve)'
t "substitution in a plan argument" ask 'tofu plan $(echo -destroy)'
t "substitution around a plan" ask 'X=$(mise run tofu core plan)'

# Saved plans and read-only subcommands
t "terragrunt apply --working-dir saved plan" none "terragrunt apply --working-dir live/pg -lock-timeout=5m -no-color tfplan"
t "terragrunt apply absolute working dir and plan" none "terragrunt apply --working-dir /abs/live/pg -no-color /abs/live/pg/pg.tfplan"
t "terragrunt apply --log-level value" none "terragrunt apply --log-level debug --config live/x.hcl tfplan"
t "apply core.plan" none "tofu apply core.plan"
t "apply plan.bin" none "tofu apply plan.bin"
t "apply a plan under a variable directory" none 'S=/tmp/x; tofu apply -lock-timeout=15m $S/slice52.tfplan'
t "apply a plan in a variable" none 'P=core.tfplan; tofu apply $P'
t "apply a braced plan variable" none 'P=core.tfplan; tofu apply ${P}'
t "apply a plan variable, subagent without token" deny 'P=core.tfplan; tofu apply $P' notoken
t "apply a plan variable, subagent with token" none 'P=core.tfplan; tofu apply $P' withtoken
t "apply an unassigned plan variable" ask 'tofu apply "$P"'
t "apply a plan under a computed directory" ask 'S=$(mktemp -d); tofu apply $S/x.tfplan'
t "apply a variable that is not a plan name" deny 'P=main.tf; tofu apply $P'
t "apply a variable holding -auto-approve" deny 'P=-auto-approve; tofu apply $P'
t "apply a variable holding two words" deny 'P="-auto-approve x.tfplan"; tofu apply $P'
t "apply unassigned variable and -auto-approve" deny 'tofu apply $P -auto-approve'
t "apply a variable assigned twice" ask 'P=a.tfplan; P=$(ls); tofu apply $P'
t "apply a variable set by a prefix assignment" ask 'P=a.tfplan tofu apply $P'
t "apply with flags after the plan" deny "mise run tofu grafana apply tfplan -no-color"
why "apply flags after the plan: reason" "Put flags before the plan file: apply -no-color tfplan." "mise run tofu grafana apply tfplan -no-color"
t "apply a parameter default stays a deny" deny 'tofu apply ${X:--auto-approve}'
t "apply plan name as a flag value is not the plan" deny "tofu apply -var tfplan"
t "providers schema" none "tofu providers schema -json"
t "providers lock" none "tofu providers lock"
t "providers with an unknown verb" ask "tofu providers frob"
t "graph" none "tofu graph"
t "metadata functions" none "tofu metadata functions -json"
t "terragrunt hclfmt" none "terragrunt hclfmt"
t "terragrunt hcl fmt" none "terragrunt hcl fmt"
t "terragrunt hcl validate" none "terragrunt hcl validate --inputs"
t "terragrunt list" none "terragrunt list"
t "terragrunt find with a working dir" none "terragrunt --working-dir live find"
t "terragrunt --version" none "terragrunt --version"
t "terragrunt run --all show" none "terragrunt run --all -- show tfplan"
t "terragrunt run apply -auto-approve" deny "terragrunt run -- apply -auto-approve"
t "terragrunt run --all apply saved plan" none "terragrunt run --all -- apply tfplan"
t "terragrunt hcl with an unknown verb" ask "terragrunt hcl frob"
t "list is not a read-only verb for tofu" ask "tofu list"
t "mise which tofu" none "mise which tofu"
t "mise where terragrunt" none "mise where terragrunt"
t "mise ls is a lookup" none "mise ls terraform"
t "tofu test still asks" ask "tofu test"
t "plan -out=x.plan gets no allow" none "tofu plan -out=x.plan"

# Credentialed reads: gated for subagents; the main session is asked only where values leak
t "subagent console, no token" deny "tofu console" notoken
t "subagent console via mise, no token" deny "echo 'jsonencode(local.x)' | mise run tofu cloudflare console" notoken
t "subagent state pull, no token" deny "tofu state pull" notoken
t "subagent state show, no token" deny "tofu state show module.x" notoken
t "subagent show, no token" deny "tofu show tfplan" notoken
t "subagent output -json, no token" deny "tofu output -json" notoken
t "subagent output, no token" deny "tofu output" notoken
t "subagent refresh, no token" deny "tofu refresh" notoken
t "subagent state list, no token" none "tofu state list" notoken
t "subagent console, token" none "tofu console" withtoken
t "subagent state pull, token" none "tofu state pull" withtoken
t "subagent state show, token" none "tofu state show module.x" withtoken
t "subagent output -json, token" none "tofu output -json" withtoken
t "subagent show, token" none "tofu show tfplan" withtoken
t "main output -json asks" ask "tofu output -json"
t "main output -raw asks" ask "tofu output -raw db_password"
t "main show -json asks" ask "tofu show -json tfplan"
t "main state pull asks" ask "tofu state pull"
t "main console asks" ask "tofu console"
t "main refresh asks" ask "tofu refresh"
t "main output is quiet" none "tofu output"
t "main show is quiet" none "tofu show"
t "main state show is quiet" none "tofu state show aws_instance.a"

# Wrappers around a guarded tool
t "lock wrapper script, saved plan, main" none '$S/locked.sh tofu-core mise run tofu core apply tfplan'
t "lock wrapper script, saved plan, subagent" deny '$S/locked.sh tofu-core mise run tofu core apply tfplan' notoken
t "lock wrapper script, saved plan, subagent token" none '$S/locked.sh tofu-core mise run tofu core apply tfplan' withtoken
t "lock wrapper script, auto-approve" deny '$S/locked.sh tofu-core mise run tofu core apply -auto-approve'
t "absolute wrapper script, auto-approve" deny '/abs/wrapper.sh mise run tofu core apply -auto-approve'
t "bare variable command stays ask" ask 'K=tofu; $K apply -auto-approve'
t "echo of an apply stays ask" ask 'echo tofu apply -auto-approve'
t "git argument named like a tool is data" none 'git checkout terraform'
t "path git with a tool word is data" none '/usr/bin/git log tofu'

# aws in the main session: destructive operations ask
t "aws terminate-instances" ask "aws ec2 terminate-instances --instance-ids i-1"
t "aws rds delete-db-instance" ask "aws rds delete-db-instance --db-instance-identifier x"
t "aws s3 rm" ask "aws s3 rm s3://b/k --recursive"
t "aws s3 rb" ask "aws s3 rb s3://b --force"
t "aws s3 mv" ask "aws s3 mv s3://b/a s3://b/c"
t "aws s3 sync --delete" ask "aws s3 sync . s3://b --delete"
t "aws s3 sync" none "aws s3 sync . s3://b"
t "aws put-bucket-policy" ask "aws s3api put-bucket-policy --bucket b --policy file://p.json"
t "aws iam delete-user behind --profile" ask "aws --profile prod iam delete-user --user-name x"
t "aws stop-instances" ask "aws ec2 stop-instances --instance-ids i-1"
t "aws detach-role-policy" ask "aws iam detach-role-policy --role-name r --policy-arn a"
t "aws revoke-security-group-ingress" ask "aws ec2 revoke-security-group-ingress --group-id g"
t "aws s3 ls" none "aws s3 ls"
t "aws s3 cp" none "aws s3 cp a s3://b/a"
t "aws filter-log-events" none "aws logs filter-log-events --log-group-name g"
t "aws describe with global flags" none "aws --region us-east-1 --output json ec2 describe-instances"
t "aws iam delete-user help is quiet" none "aws iam delete-user help"
t "aws terminate in a subagent without token" deny "aws ec2 terminate-instances --instance-ids i-1" notoken

# Kubernetes: production is judged by context, kubeconfig, or the fixture's current-context
prod=$root/kube-prod.yaml
t "prod delete pvc and pv" deny "kubectl --context omni-prod -n lh-backup-test delete pvc/data pv/pv-1"
t "prod delete pv, --context=" deny "kubectl --context=omni-prod delete pv pv-1"
t "prod delete pvc by plural name" deny "kubectl --context omni-prod -n x delete persistentvolumeclaims data"
t "prod delete crd" deny "kubectl --context omni-prod delete crd foos.example.com"
t "prod delete node" deny "kubectl --context omni-prod delete node n1"
t "prod delete node behind wrappers" deny "timeout 30 env X=1 kubectl --context omni-prod delete node n1"
t "prod delete pvc by KUBECONFIG prefix" deny "KUBECONFIG=~/.kube/prod-kubeconfig.yaml kubectl -n x delete pvc d"
t "prod delete pvc by exported KUBECONFIG" deny 'export KUBECONFIG=~/.kube/prod-kubeconfig.yaml; kubectl -n x delete pvc d'
t "prod delete pvc by --kubeconfig" deny "kubectl --kubeconfig ~/.kube/prod-kubeconfig.yaml -n x delete pvc d"
t "prod delete via mise exec" deny "export KUBECONFIG=~/.kube/prod-kubeconfig.yaml; mise exec -- kubectl delete pvc d"
kubecfg=$prod t "prod fixture current-context, guarded delete" deny '[ "$(kubectl config current-context)" = omni-prod ] && kubectl -n lh-backup-test delete pvc data'
kubecfg=$prod t "prod fixture current-context, delete pv" deny "kubectl delete pv pv-1"
t "prod apply, subagent without token" deny "kubectl --context omni-prod apply -f x.yaml" notoken
t "prod delete ns asks" ask "kubectl --context omni-prod delete ns foo"
t "prod delete longhorn volume asks" ask "kubectl --context omni-prod -n longhorn-system delete volume v1"
t "prod delete a group-qualified kind asks" ask "kubectl --context omni-prod -n longhorn-system delete backupvolumes.longhorn.io b1"
t "prod delete -f asks" ask "kubectl --context omni-prod delete -f x.yaml"
t "prod apply asks" ask "kubectl --context omni-prod apply -f x.yaml"
t "prod apply with a token still asks" ask "kubectl --context omni-prod apply -f x.yaml" withtoken
t "prod scale asks" ask "kubectl --context omni-prod -n isktel scale deploy/worker --replicas=0"
t "prod rollout restart asks" ask "kubectl --context omni-prod rollout restart deploy/x"
t "prod rollout undo asks" ask "kubectl --context omni-prod rollout undo deploy/x"
t "prod exec asks" ask "kubectl --context omni-prod exec -it pod -- sh"
t "prod drain asks" ask "kubectl --context omni-prod drain n1 --ignore-daemonsets"
t "prod patch asks" ask "kubectl --context omni-prod patch deploy x -p '{}'"
t "prod unknown verb asks" ask "kubectl --context omni-prod frobnicate"
t "production context name asks" ask "kubectl --context eks-production apply -f x.yaml"
t "prod context from a variable asks" ask 'C=omni-prod; kubectl --context $C apply -f x.yaml'
t "unknown context asks" ask 'kubectl --context "$CTX" apply -f x.yaml'
t "helm upgrade on prod asks" ask "helm --kube-context omni-prod upgrade x chart"
t "helm install on prod asks" ask "helm --kube-context omni-prod install x chart"
t "helm rollback on prod asks" ask "helm --kube-context omni-prod rollback x 1"
t "helm upgrade on prod, subagent without token" deny "helm --kube-context omni-prod upgrade x chart" notoken
t "talosctl reset asks" ask "talosctl -n 10.0.0.1 reset"
t "talosctl upgrade asks" ask "talosctl --nodes 10.0.0.1 upgrade --image x"
t "talosctl apply-config asks" ask "talosctl apply-config -n 10.0.0.1 -f c.yaml"
t "talosctl reboot asks" ask "talosctl -n 10.0.0.1 reboot"
t "talosctl shutdown asks" ask "talosctl -n 10.0.0.1 shutdown"
t "talosctl etcd remove-member asks" ask "talosctl etcd remove-member abc"
t "talosctl in a subagent without token" deny "talosctl -n 10.0.0.1 reset" notoken
t "omnictl delete asks" ask "omnictl delete cluster x"
t "omnictl apply asks" ask "omnictl apply -f c.yaml"
t "omnictl get" none "omnictl get clusters"
t "omnictl delete --help asks (help is ignored beside an ask verb)" ask "omnictl delete --help"
t "talosctl reboot --help asks" ask "talosctl reboot --help"
t "prod apply --help asks" ask "kubectl --context omni-prod apply --help"
t "dev scale" none "kubectl --context omni-dev -n isktel-dev scale deploy/worker --replicas=0"
t "dev delete pvc" none "kubectl --context omni-dev -n x delete pvc d"
t "dev helm upgrade" none "helm --kube-context omni-dev upgrade x chart"
t "prod get pods" none "kubectl --context omni-prod get pods -A"
t "prod logs" none "kubectl --context omni-prod logs x"
t "prod describe pv" none "kubectl --context omni-prod describe pv"
t "prod rollout status" none "kubectl --context omni-prod rollout status deploy/x"
t "prod config view" none "kubectl --context omni-prod config view"
t "prod helm list" none "helm --kube-context omni-prod list -A"
t "prod kubeconfig get" none 'export KUBECONFIG=~/.kube/prod-kubeconfig.yaml; mise exec -- kubectl -n flux-system get ks'
t "dev kubeconfig delete" none 'export KUBECONFIG=~/.kube/dev.yaml; kubectl -n x delete pvc d'
t "variable context holding dev" none 'C=omni-dev; kubectl --context $C apply -f x.yaml'
t "talosctl get members" none "talosctl get members"
t "fixture dev current-context, delete pvc" none "kubectl -n x delete pvc d"
t "fixture dev current-context, apply" none "kubectl apply -f x.yaml"
kubecfg=$prod t "fixture prod current-context, get" none "kubectl -n x get pvc"
kubecfg=$prod t "fixture prod current-context, apply asks" ask "kubectl apply -f x.yaml"
kubecfg=$prod t "explicit dev context beats the prod fixture" none "kubectl --context omni-dev apply -f x.yaml"
kubecfg=$root/missing.yaml t "unreadable kubeconfig asks" ask "kubectl -n x delete pvc d"
kubecfg=$root/missing.yaml t "unreadable kubeconfig, get stays quiet" none "kubectl -n x get pvc"
kubecfg=$root/kube-big.yaml t "current-context past the read cap is not read" none "kubectl -n x delete pvc d"
t "kubectl as an argument is data" none "git log --grep kubectl"
t "kubectl in echo is data" none "echo kubectl --context omni-prod delete pv x"
t "product is not prod" none "kubectl --context product-team apply -f x.yaml"
t "prodigy is not prod" none "kubectl --context prodigy apply -f x.yaml"
t "K variable holding a prod context stays quiet" none 'K="kubectl --context omni-prod"; $K get pods'

# Review fixes
# Variables bound by loops, read and the like are unknown
t "plan variable rebound by a for loop" ask 'P=tfplan; for P in -auto-approve; do tofu apply $P; done'
t "plan variable rebound by read" ask 'P=tfplan; read -r P < args.txt; tofu apply $P'
t "plan variable rebound by mapfile" ask 'P=tfplan; mapfile -t P < args.txt; tofu apply $P'
t "plan variable rebound by printf -v" ask 'P=tfplan; printf -v P %s -auto-approve; tofu apply $P'
t "plan variable rebound by arithmetic" ask 'P=tfplan; (( P = 1 )); tofu apply $P'
t "plan variable rebound by a default assignment" ask 'P=tfplan; : ${P:=x}; tofu apply $P'
t "plan variable bound once stays a plan" none 'P=core.tfplan; tofu apply $P'
t "kube context rebound by a for loop" ask 'C=omni-dev; for C in omni-prod; do kubectl --context $C delete pv pv-1; done'
# A variable in the last part of a command path may name any command
t "path with variable tool name: destroy" ask 'D=/usr/bin; T=tofu; $D/$T destroy -auto-approve'
t "path with variable tool name: state rm" ask 'D=/usr/bin; T=tofu; $D/$T state rm module.db'
t "substituted path to the tool" ask '$(echo /usr/bin/tofu) destroy -auto-approve'
# Heredocs fed to a shell behind an unknown command
t "heredoc into flock bash" ask $'flock /tmp/l bash <<\'EOF\'\ntofu destroy -auto-approve\nEOF'
t "heredoc into docker exec sh" ask $'docker exec -i c sh <<\'EOF\'\ntofu destroy -auto-approve\nEOF'
t "doc heredoc with a later dot argument is data" none $'cat > docs/x.md <<\'EOF\'\nrun tofu plan\nEOF\ngit add . && git commit -m x'
t "python heredoc posix_spawn" ask $'python3 - <<\'EOF\'\nimport os; os.posix_spawn("/usr/bin/tofu", ["tofu","destroy"], {})\nEOF'
t "python heredoc pty spawn" ask $'python3 - <<\'EOF\'\nimport pty; pty.spawn(["tofu","destroy"])\nEOF'
t "perl heredoc qx" ask $'perl - <<\'EOF\'\nmy $x = qx{tofu destroy};\nEOF'
t "perl heredoc backticks" ask $'perl - <<\'EOF\'\nmy $x = `tofu destroy`;\nEOF'
t "perl heredoc open with a pipe" ask $'perl - <<\'EOF\'\nopen(F, "tofu destroy |");\nEOF'
# kubectl flags, verbs and selectors
t "-h as a flag value does not mean help" deny "kubectl --cache-dir -h --context omni-prod delete pv pv-1"
t "unknown-value flag cannot hide the verb" deny "kubectl --context omni-prod --profile-output get delete pv pv-1"
t "delete --grace-period value" deny "kubectl --context omni-prod delete --grace-period 0 pv pv-1"
t "delete --timeout and --cascade values" deny "kubectl --context omni-prod delete --timeout 30s --cascade foreground pvc d"
t "protected kind after a name" deny "kubectl --context omni-prod delete deploy x pv/pv-1"
t "empty --context falls through to --kubeconfig" deny "kubectl --context= --kubeconfig ~/.kube/prod-kubeconfig.yaml delete pv pv-1"
kubecfg=$prod t "empty --context and --kubeconfig use the fixture" deny "kubectl --context= --kubeconfig= delete pv pv-1"
kubecfg=$prod t "empty --context '' uses the fixture" deny "kubectl --context '' delete pv pv-1"
t "xargs feeds kubectl delete" ask "kubectl --context omni-prod get pv -o name | xargs kubectl --context omni-prod delete"
t "watch wraps kubectl delete" deny "watch -n1 kubectl --context omni-prod delete pv pv-1"
t "watch wraps kubectl apply on prod" ask "watch kubectl --context omni-prod apply -f x.yaml"
t "heredoc into bash holds kubectl" ask $'bash <<\'EOF\'\nkubectl --context omni-prod delete pv pv-1\nEOF'
t "echoed kubectl piped to sh" ask 'echo "kubectl --context omni-prod delete pv pv-1" | sh'
t "variable holding kubectl, delete pv" deny 'K="kubectl --context omni-prod"; $K delete pv pv-1'
t "variable holding kubectl, get stays quiet" none 'K="kubectl --context omni-prod"; $K get pods'
t "brew install helm is data" none "brew install helm"
kubecfg=$prod t "export after the command is ignored" deny "kubectl -n x delete pvc d; export KUBECONFIG=$root/kube-dev.yaml"
kubecfg=$prod t "dev export before may sit in a subshell" deny "( export KUBECONFIG=$root/kube-dev.yaml ); kubectl -n x delete pvc d"
t "dev export before, dev process" none "export KUBECONFIG=$root/kube-dev.yaml; kubectl -n x delete pvc d"
t "kubectl auth reconcile on prod" ask "kubectl --context omni-prod auth reconcile -f rbac.yaml"
t "kubectl auth can-i" none "kubectl --context omni-prod auth can-i delete pv"
t "kubectl auth whoami" none "kubectl --context omni-prod auth whoami"
t "--cluster named prod" deny "kubectl --cluster prod-eks --context omni-dev delete pv pv-1"
t "HELM_KUBECONTEXT prefix on prod" ask "HELM_KUBECONTEXT=omni-prod helm upgrade x chart"
t "HELM_KUBECONTEXT export on prod" ask "export HELM_KUBECONTEXT=omni-prod; helm upgrade x chart"
t "HELM_KUBECONTEXT dev" none "HELM_KUBECONTEXT=omni-dev helm upgrade x chart"
t "--kubeconfig not named prod selects a prod context" deny "kubectl --kubeconfig $root/cfg-a.yaml delete pv pv-1"
t "--kubeconfig not named prod selects a dev context" none "kubectl --kubeconfig $root/cfg-b.yaml delete pv pv-1"
kubecfg=$root/kube-bigfirst.yaml t "current-context inside the read cap of a big file" deny "kubectl -n x delete pvc d"
t "talosctl wipe" ask "talosctl wipe disk sda"
t "talosctl upgrade-k8s" ask "talosctl upgrade-k8s --to 1.31.0"
t "talosctl etcd leave" ask "talosctl etcd leave"
t "talosctl rollback" ask "talosctl rollback"
t "talosctl patch machineconfig" ask "talosctl patch mc -p @p.yaml"
t "talosctl edit machineconfig" ask "talosctl edit machineconfig"
t "talosctl patch of a non-config is quiet" none "talosctl get machineconfig"
# Rebinding: any construct that can bind a variable other than one plain NAME=value makes every variable unknown
t "printf -v with a quoted name" ask 'P=tfplan; printf -v "P" %s -auto-approve; tofu apply $P'
t "read -d with a quoted delimiter" ask 'P=tfplan; read -r -d "|" P < args.txt; tofu apply $P'
t "eval assigns the plan variable" ask 'P=tfplan; eval P=-auto-approve; tofu apply $P'
t "source may assign the plan variable" ask 'P=tfplan; source ./vars.sh; tofu apply $P'
t "dot may assign the plan variable" ask 'P=tfplan; . ./vars.sh; tofu apply $P'
t "read with a quoted name" ask 'P=tfplan; read -r "P" < args.txt; tofu apply $P'
t "mapfile with a quoted name" ask 'P=tfplan; mapfile -t "P" < args.txt; tofu apply $P'
t "read with a prompt over 200 characters" ask "P=tfplan; read -r -p \"$(printf 'x%.0s' $(seq 250))\" P; tofu apply \$P"
t "read spelled as an ANSI-C string" ask "P=tfplan; \$'\\x72ead' P < args.txt; tofu apply \$P"
t "read spelled by brace expansion" ask 'P=tfplan; {rea,}d P < args.txt; tofu apply $P'
t "read named by a substitution" ask 'P=tfplan; $(echo read) P < args.txt; tofu apply $P'
t "read named by a variable" ask 'R=read; P=tfplan; $R P < args.txt; tofu apply $P'
t "element assignment rebinds the plan variable" ask 'P=tfplan; P[0]=-auto-approve; tofu apply $P'
t "export append rebinds the plan variable" ask 'P=x; export P+=.tfplan; tofu apply $P'
t "a plan variable assigned twice" ask 'P=tfplan; P=tfplan; tofu apply $P'
t "\$_ is the last argument, not its assignment" ask '_=tfplan; echo -auto-approve; tofu apply $_'
t "IFS splits a plan variable" ask 'P=x-auto-approvex.tfplan; IFS=x; tofu apply $P'
t "zsh glob qualifier runs an assignment" ask "P=tfplan; : *(e:'P=-auto-approve':); tofu apply \$P"
t "eval rebinds the kube context" ask 'C=omni-dev; eval C=omni-prod; kubectl --context $C delete pv pv-1'
t "export append rebinds the kube context" ask 'C=omni; export C+=-prod; kubectl --context $C delete pv pv-1'
t "held kubectl with a rebinding read asks" ask 'K="kubectl --context omni-prod"; read x </dev/null; $K delete pv pv-1'
t "loop variable naming kubectl asks" ask 'for k in kubectl; do $k --context omni-prod delete pv pv-1; done'
t "substitution naming kubectl asks" ask '$(which kubectl) --context omni-prod delete pv pv-1'
t "unset variable as a command with only kubectl named stays quiet" none 'kubectl --context omni-dev get pods; $EDITOR notes.txt'
kubecfg=$prod t "context variable set in a subshell falls back to the prod process" deny '(C=omni-dev); kubectl --context=$C delete pv pv-1'
t "context variable set in a subshell, dev process" none '(C=omni-dev); kubectl --context=$C delete pv pv-1'
# Package runners and find actions run their arguments as a command
t "npm exec wraps kubectl delete pv" deny "npm exec -- kubectl --context omni-prod delete pv pv-1"
t "pnpm dlx wraps kubectl delete pv" deny "pnpm dlx kubectl --context omni-prod delete pv pv-1"
t "find -exec wraps kubectl delete pv" deny "find . -exec kubectl --context omni-prod delete pv {} \\;"
t "npx wraps kubectl delete pv" deny "npx kubectl --context omni-prod delete pv pv-1"
t "npm exec wraps tofu destroy" deny "npm exec -- tofu destroy -auto-approve"
t "pnpm exec wraps tofu destroy" deny "pnpm exec tofu destroy -auto-approve"
t "bundle exec wraps tofu destroy" deny "bundle exec tofu destroy"
t "uv run wraps tofu destroy" deny "uv run --no-project tofu destroy"
t "brew bundle exec wraps tofu destroy" deny "brew bundle exec -- tofu destroy"
t "npm exec runs sh -c with kubectl" deny "npm exec -- sh -c 'kubectl --context omni-prod delete pv pv-1'"
t "npx -c runs a command string" ask "npx -c 'kubectl --context omni-prod delete pv pv-1'"
t "npx plan in a subagent without token" deny "npx tofu plan" notoken
t "find -exec grep of a tool name is data" none "find . -name '*.md' -exec grep -l kubectl {} +"
t "npm install stays quiet" none "npm install"
t "pnpm add helm stays quiet" none "pnpm add helm"
# Variables that hold a wrapped kubectl
t "variable holding mise exec kubectl, delete pv" deny 'k="mise exec -- kubectl --context omni-prod"; $k delete pv pv-1'
t "variable holding sudo kubectl, delete pv" deny 'K="sudo kubectl --context omni-prod"; $K delete pv pv-1'
t "variable holding mise exec kubectl on dev, get" none 'k="mise exec -- kubectl --context omni-dev"; $k get ns'
# Kubeconfig files: only regular files are read, and only when no command in the script can write them
start=$(date +%s%N)
got=$(mkin "kubectl --kubeconfig $root/kube-fifo.yaml delete pv pv-1" | timeout 5 bash -c "$(declare -f guard decision); root='$root' script='$script' kubecfg='$root/kube-dev.yaml' decision")
ms=$(( ($(date +%s%N) - start) / 1000000 ))
if [ "$got" = ask ]; then ok "--kubeconfig FIFO asks without blocking (${ms} ms)"; else bad "--kubeconfig FIFO" "ask within 5 s" "$got"; fi
got=$(mkin "KUBECONFIG=$root/kube-fifo.yaml kubectl delete pv pv-1" | timeout 5 bash -c "$(declare -f guard decision); root='$root' script='$script' kubecfg='$root/kube-dev.yaml' decision")
if [ "$got" = ask ]; then ok "KUBECONFIG= FIFO asks without blocking"; else bad "KUBECONFIG= FIFO" "ask within 5 s" "$got"; fi
got=$(mkin "kubectl delete pv pv-1" | timeout 5 bash -c "$(declare -f guard decision); root='$root' script='$script' kubecfg='$root/kube-fifo.yaml' decision")
if [ "$got" = ask ]; then ok "process kubeconfig FIFO asks and does not block"; else bad "process kubeconfig FIFO" "ask within 5 s" "$got"; fi
t "missing --kubeconfig asks" ask "kubectl --kubeconfig $root/missing.yaml delete pv pv-1"
t "directory as --kubeconfig asks" ask "kubectl --kubeconfig $root/.kube delete pv pv-1"
if [ "$(id -u)" != 0 ]; then
  cp "$root/cfg-b.yaml" "$root/noread.yaml" && chmod 000 "$root/noread.yaml"
  t "unreadable --kubeconfig asks" ask "kubectl --kubeconfig $root/noread.yaml delete pv pv-1"
fi
t "relative --kubeconfig asks" ask "kubectl --kubeconfig cfg-b.yaml delete pv pv-1"
t "KUBECONFIG= prefix selects a prod context" deny "KUBECONFIG=$root/cfg-a.yaml kubectl delete pv pv-1"
t "exported KUBECONFIG selects a prod context" deny "export KUBECONFIG=$root/cfg-a.yaml; kubectl delete pv pv-1"
t "KUBECONFIG list with a prod file" deny "KUBECONFIG=$root/cfg-b.yaml:$root/cfg-a.yaml kubectl delete pv pv-1"
t "missing ~/ kubeconfig asks" ask 'export KUBECONFIG=~/.kube/missing.yaml; kubectl -n x delete pvc d'
t "kubeconfig created in the same command asks" ask "cp a k.yaml && kubectl --kubeconfig k.yaml delete pv pv-1"
t "kubeconfig overwritten in the same command asks" ask "cp $root/cfg-a.yaml $root/cfg-b.yaml && kubectl --kubeconfig $root/cfg-b.yaml delete pv pv-1"
t "kubeconfig switched by kubectl config asks" ask "export KUBECONFIG=$root/cfg-b.yaml; kubectl config use-context omni-prod; kubectl delete pv pv-1"
t "kubeconfig written by a redirect asks" ask "echo x > $root/cfg-b.yaml; kubectl --kubeconfig $root/cfg-b.yaml delete pv pv-1"
t "dev kubeconfig in a nested shell stays quiet" none "bash -c 'kubectl --kubeconfig $root/cfg-b.yaml delete pv pv-1'"
t "prod kubeconfig in a nested shell" deny "bash -c 'kubectl --kubeconfig $root/cfg-a.yaml delete pv pv-1'"
t "dev kubeconfig with read-only neighbours stays quiet" none "export KUBECONFIG=$root/cfg-b.yaml; [ \"\$(kubectl config current-context)\" = omni-dev ] || exit 9; kubectl delete pvc d 2>&1 | tail -1"
# tofu flags with values, aws global flags and variables
t "show -json=true asks" ask "tofu show -json=true tfplan"
t "output -raw=true asks" ask "tofu output -raw=true x"
t "aws global --cli-binary-format" ask "aws --cli-binary-format raw-in-base64-out ec2 terminate-instances --instance-ids i-1"
t "aws operation in a variable" ask 'OP=terminate-instances; aws ec2 $OP --instance-ids i-1'
t "aws operation in an unknown variable" ask 'aws ec2 $OP --instance-ids i-1'
t "aws read operation in a variable" none 'OP=describe-instances; aws ec2 $OP'
# awk programs that run commands
t "awk system() runs tofu" ask "awk 'BEGIN{system(\"tofu destroy -auto-approve\")}' /dev/null"
t "awk pipe to getline runs tofu" ask "awk 'BEGIN{\"tofu output\" | getline x}' /dev/null"
t "awk printing a tool name is data" none "awk '/tofu/ {print \$1}' notes.txt"

# A shared heredoc is parsed once, so a 64 KB command with many commands under one redirect stays fast
colons=$(printf ':;%.0s' $(seq 6000))
subs=$(printf '$(tofu destroy)\n%.0s' $(seq 2500))
big="{ $colons } <<EOF"$'\n'"$subs"$'\n'"EOF"
start=$(date +%s%N)
got=$(mkin "$big" | decision)
ms=$(( ($(date +%s%N) - start) / 1000000 ))
if [ "$got" = deny ] && [ "$ms" -lt 1000 ]; then ok "64 KB shared heredoc: deny in ${ms} ms"; else bad "64 KB shared heredoc" "deny under 1000 ms" "$got in ${ms} ms"; fi

# autoAllowReadOnly on: the allowlisted forms allow, and the subagent gate still holds
auto=true t "option on: plan" allow "tofu plan"
auto=true t "option on: plan -out" allow "tofu plan -out=x.tfplan"
auto=true t "option on: plan -out=tfplan" allow "tofu plan -out=tfplan"
auto=true t "option on: validate" allow "terraform validate"
auto=true t "option on: fmt" allow "tofu fmt -recursive"
auto=true t "option on: init" allow "tofu init -upgrade"
auto=true t "option on: state list" allow "tofu state list"
auto=true t "option on: state show" allow "tofu state show aws_instance.a"
auto=true t "option on: version flag" allow "tofu --version"
auto=true t "option on: aws --version" allow "aws --version"
auto=true t "option on: aws help" allow "aws ec2 help"
auto=true t "option on: aws operation help" allow "aws iam delete-user help"
auto=true t "option on: mise exec plan" allow "mise exec -- tofu plan"
auto=true t "option on: mise run tofu env plan" allow "mise run tofu core plan"
auto=true t "option on: mise run tofu env plan -out" allow "mise run tofu core plan -out=uptimekuma.tfplan"
auto=true t "option on: subagent state list, no token" allow "tofu state list" notoken
auto=true t "option on: subagent state show, token" allow "tofu state show module.x" withtoken
auto=true t "option on: subagent plan, token" allow "tofu plan" withtoken
auto=true t "option on: subagent aws --version needs no token" allow "aws --version" notoken
auto=true t "option on: subagent brief after a meta line" allow "tofu plan" metabrief
auto=true t "option on: subagent plan, no token" deny "tofu plan" notoken
auto=true t "option on: subagent init, no token" deny "terraform init" notoken
auto=true t "option on: subagent init, token" allow "terraform init" withtoken
auto=true t "option on: subagent plan, unreadable brief" ask "tofu plan" nosuchagent
auto=true t "option on: subagent meta token cannot grant" ask "tofu plan" metatoken
auto=true t "option on: apply still denied" deny "tofu apply -auto-approve"
auto=true t "option on: compound gets no allow" none "cd infra && tofu plan"
auto=false t "option false: plan" none "tofu plan"
auto=TRUE t "option is the exact string true" none "tofu plan"

# V3: plan and init run repo code, so by default the guard has no opinion, and init is a gate
t "terraform plan, default" none "terraform plan"
auto=true t "terraform plan, option on" allow "terraform plan"
t "mise run tofu dev plan, default" none "mise run tofu dev plan"
auto=true t "mise run tofu dev plan, option on" allow "mise run tofu dev plan"
t "terraform init, default" none "terraform init"
t "subagent init, no token" deny "terraform init" notoken
t "subagent init, token" none "terraform init" withtoken
t "subagent init via mise run, no token" deny "mise run tofu dev init" notoken
t "subagent init behind timeout, no token" deny "timeout 60 terraform init -upgrade" notoken
t "subagent init with a backend file, no token" deny "terraform init -backend-config=x.hcl" notoken
t "subagent plan, unreadable brief" ask "tofu plan" nosuchagent
t "subagent init, unreadable brief" ask "tofu init" nosuchagent

# V4: aliases are read as the tool they stand for
t "k delete pvc on prod" deny "k --context prod delete pvc data"
t "kubecolor delete pvc on prod" deny "kubecolor --context prod delete pvc data"
t "oc delete pvc on prod" deny "oc --context prod delete pvc data"
t "k apply on prod asks" ask "k --context omni-prod apply -f x.yaml"
t "k apply on prod, subagent without token" deny "k --context omni-prod apply -f x.yaml" notoken
t "k get on prod stays quiet" none "k --context omni-prod get pods"
t "oc delete on dev stays quiet" none "oc --context omni-dev delete pvc d"
t "tf destroy" deny "tf destroy"
t "tf apply -auto-approve" deny "tf apply -auto-approve"
t "tg run-all destroy" deny "tg run-all destroy"
t "tf plan, subagent without token" deny "tf plan" notoken
t "kubecolor behind sudo" deny "sudo kubecolor --context prod delete pv x"
t "kubecolor behind watch" deny "watch kubecolor --context prod delete pv x"
t "kubecolor behind mise exec" deny "mise exec -- kubecolor --context prod delete pv x"
t "variable holding oc, delete pv" deny 'K="oc --context prod"; $K delete pv x'
kubecfg=$prod t "k as an argument of an unknown command is data" none "foo k delete pv x"
t "sort -k is not kubectl" none "sort -k 2 notes.txt"
t "echo of tf is data" none "echo tf destroy"
# helmfile: destroy, delete, sync and apply ask in any environment
t "helmfile -e production destroy" ask "helmfile -e production destroy"
why "helmfile on production: reason" "production" "helmfile -e production destroy"
t "helmfile sync on dev asks" ask "helmfile -e dev sync"
t "helmfile apply asks" ask "helmfile apply"
t "helmfile delete with a selector asks" ask "helmfile -l name=x delete"
t "helmfile destroy, subagent without token" deny "helmfile destroy" notoken
t "helmfile diff stays quiet" none "helmfile -e production diff"
t "helmfile template stays quiet" none "helmfile template"
t "helmfile list stays quiet" none "helmfile list"
t "helmfile destroy --help asks" ask "helmfile destroy --help"
# pulumi: destroy, up, refresh and their aliases ask on any stack
t "pulumi destroy --yes" ask "pulumi destroy --yes"
t "pulumi down" ask "pulumi down -y"
t "pulumi up" ask "pulumi up --stack dev"
t "pulumi refresh" ask "pulumi refresh"
t "pulumi --cwd before destroy" ask "pulumi --cwd infra destroy"
t "pulumi stack rm asks" ask "pulumi stack rm dev --yes"
why "pulumi on a prd stack: reason" "production stack" "pulumi up --stack prd"
t "pulumi destroy, subagent without token" deny "pulumi destroy --yes" notoken
t "pulumi behind an unknown sudo option" ask "sudo -iu root pulumi destroy"
t "pulumi preview stays quiet" none "pulumi preview"
t "pulumi stack ls stays quiet" none "pulumi stack ls"
t "pulumi up --help asks" ask "pulumi up --help"
t "echo pulumi destroy is data" none "echo pulumi destroy"
# Wrappers: nix run maps the installable's attribute to its program; nix shell -c and busybox sh -c are unwrapped
t "nix run terraform destroy" deny "nix run nixpkgs#terraform -- destroy"
t "nix run opentofu destroy" deny "nix run nixpkgs#opentofu -- destroy -auto-approve"
t "nix run a legacyPackages path" deny "nix run nixpkgs#legacyPackages.x86_64-linux.terraform -- destroy"
t "nix run with an option before the installable" deny "nix run --impure nixpkgs#terraform -- destroy"
t "nix run kubectl on prod" deny "nix run nixpkgs#kubectl -- --context prod delete pv x"
t "nix run terraform plan stays quiet" none "nix run nixpkgs#terraform -- plan"
t "nix build of terraform stays quiet" none "nix build nixpkgs#terraform"
t "nix shell -c terraform destroy" deny "nix shell nixpkgs#terraform -c terraform destroy"
t "nix develop --command tofu destroy" deny "nix develop --command tofu destroy"
t "busybox sh -c terraform destroy" deny "busybox sh -c 'terraform destroy'"
t "toybox sh -c tofu destroy" deny "toybox sh -c 'tofu destroy'"
t "fish -c tofu destroy" deny "fish -c 'tofu destroy'"
t "busybox ash -c kubectl delete pv on prod" deny "busybox ash -c 'kubectl --context prod delete pv x'"
t "busybox sh -c with a plan still asks" ask "busybox sh -c 'tofu plan'"
t "busybox sh -c with variable code asks" ask 'X="tofu destroy"; busybox sh -c "$X"'
t "busybox with a variable applet asks" ask 'busybox $S -c "tofu plan"'
t "heredoc into busybox sh" ask $'busybox sh <<\'EOF\'\ntofu plan\nEOF'
# python -m awscli is aws
t "python3 -m awscli s3 rm" ask "python3 -m awscli s3 rm s3://b --recursive"
t "python3 -mawscli terminate" ask "python3 -mawscli ec2 terminate-instances --instance-ids i-1"
t "python3 -Im awscli, subagent without token" deny "python3 -Im awscli s3 ls" notoken
t "python -m awscli describe stays quiet" none "python -m awscli ec2 describe-instances"
t "python3 -m pip install awscli stays quiet" none "python3 -m pip install awscli"
t "aws kms schedule-key-deletion asks" ask "aws kms schedule-key-deletion --key-id k --pending-window-in-days 7"

# V5: the prodPattern option, default prod(uction)?\d*|prd|live
t "prd is production" deny "kubectl --context prd delete pv x"
t "prod2 is production" deny "kubectl --context omni-prod2 delete pv x"
t "live is production" deny "kubectl --context eu-live delete pv x"
t "deliver is not live" none "kubectl --context deliver apply -f x.yaml"
t "prd kubeconfig path is production" deny "kubectl --kubeconfig ~/.kube/prd.yaml delete pvc d"
prodpat='stg' t "custom pattern: stg is production" deny "kubectl --context eu-stg delete pv x"
prodpat='stg' t "custom pattern: prod no longer is" none "kubectl --context omni-prod apply -f x.yaml"
prodpat='(' t "invalid pattern asks" ask "kubectl --context omni-dev apply -f x.yaml"
prodpat='(' t "invalid pattern, get stays quiet" none "kubectl --context omni-dev get pods"
prodpat='a)|(b' t "unbalanced pattern asks" ask "kubectl --context omni-dev apply -f x.yaml"
prodpat=$(printf 'a%.0s' $(seq 201)) t "pattern over 200 characters asks" ask "kubectl --context omni-dev apply -f x.yaml"
prodpat='(' t "invalid pattern leaves terraform checks alone" deny "tofu destroy"

# 3a: a process kubeconfig that is unreadable, or that a command may switch first, is unknown
kubecfg=$root/missing.yaml t "use-context then delete with no kubeconfig asks" ask "kubectl config use-context production; kubectl delete pvc data"
t "use-context production then delete on the dev process kubeconfig asks" ask "kubectl config use-context production; kubectl delete pvc data"
t "use-context then apply on the dev process kubeconfig asks" ask "kubectl config use-context omni-dev; kubectl apply -f x.yaml"
t "nested shell on the dev process kubeconfig stays quiet" none "bash -c 'kubectl delete pvc d'"
t "nested shell with an explicit dev context stays quiet" none "bash -c 'kubectl --context omni-dev delete pvc d'"
kubecfg=$root/missing.yaml t "unreadable process kubeconfig with an exported dev file asks" ask "export KUBECONFIG=$root/cfg-b.yaml; kubectl delete pv pv-1"
# Only a command that runs before the judged one can write the kubeconfig it reads. helm, talosctl and
# omnictl verbs keep to the cluster, and kustomize build writes only stdout, so these read the dev fixture.
t "helm upgrade on the dev process kubeconfig stays quiet" none "helm upgrade x chart"
t "helm install on the dev process kubeconfig stays quiet" none "helm install x c"
kubecfg=$prod t "helm upgrade on the prod process kubeconfig asks" ask "helm upgrade x chart"
t "kustomize piped to kubectl apply stays quiet" none "kustomize build . | kubectl apply -f -"
t "helm template piped to kubectl apply stays quiet" none "helm template x c | kubectl apply -f -"
t "kubectl apply then curl stays quiet" none "kubectl apply -f x.yaml && curl localhost:8080/health"
t "kubectl apply then curl of a quoted query stays quiet" none 'kubectl apply -f x.yaml && curl "localhost:8080/health?a=1&b=2"'
t "kubectl apply then curl of an escaped & stays quiet" none 'kubectl apply -f x.yaml && curl localhost:8080/a\&b'
t "kubectl apply beside a read-only filter stays quiet" none "kubectl apply -f x.yaml | tail -5"
t "sh -c kubectl delete on the dev process kubeconfig stays quiet" none "sh -c 'kubectl delete pv x'"
kubecfg=$prod t "sh -c kubectl delete pv on the prod process kubeconfig" deny "sh -c 'kubectl delete pv x'"
# Commands that may write the kubeconfig first still make it unknown
t "aws eks update-kubeconfig before kubectl asks" ask "aws eks update-kubeconfig --name c && kubectl delete pv x"
t "talosctl kubeconfig before kubectl asks" ask "talosctl -n 10.0.0.1 kubeconfig && kubectl delete pv x"
t "omnictl kubeconfig before kubectl asks" ask "omnictl kubeconfig -c c && kubectl delete pv x"
t "helm plugin install before kubectl asks" ask "helm plugin install https://x && kubectl apply -f x.yaml"
t "helm repo add before kubectl asks" ask "helm repo add x https://x && kubectl apply -f x.yaml"
t "helm diff (a plugin) before kubectl asks" ask "helm diff upgrade x c && kubectl apply -f x.yaml"
t "helm --post-renderer piped to kubectl asks" ask "helm template x c --post-renderer ./r.sh | kubectl apply -f -"
t "kustomize build -o before kubectl asks" ask "kustomize build . -o out.yaml && kubectl apply -f out.yaml"
t "a writer in the command's own substitution asks" ask "kubectl delete pv \$(cp a $root/kube-dev.yaml; echo x)"
t "a function body runs after a later writer" ask 'f() { kubectl delete pv x; }; cp a b; f'
t "a loop runs the kubectl again after the writer" ask 'for i in 1 2; do kubectl delete pv x; cp a b; done'
t "a writer before sh -c asks" ask "cp a b; sh -c 'kubectl delete pv x'"
t "a writer inside sh -c before kubectl asks" ask "sh -c 'cp a b; kubectl delete pv x'"
t "bash -lc reads a profile first" ask "bash -lc 'kubectl delete pv x'"
t "zsh -c reads zshenv first" ask "zsh -c 'kubectl delete pv x'"
t "a heredoc fed to bash is not read" ask $'bash <<\'EOF\'\nkubectl delete pv x\nEOF'
t "a KUBECONFIG prefix on sh -c reaches the nested kubectl" ask "KUBECONFIG=$root/cfg-a.yaml sh -c 'kubectl delete pv x'"
t "an env KUBECONFIG wrapper on sh -c reaches the nested kubectl" ask "env KUBECONFIG=$root/cfg-a.yaml sh -c 'kubectl delete pv x'"
t "an exported KUBECONFIG reaches the nested kubectl" ask "export KUBECONFIG=$root/cfg-a.yaml; sh -c 'kubectl delete pv x'"
t "sudo sh -c may read another user's kubeconfig" ask "sudo sh -c 'kubectl delete pv x'"
# Pipeline stages and background jobs run at once, so a writer written after the judged command may
# still switch the context before it reads the kubeconfig. watch repeats its command after any writer.
for c in \
  '(sleep 2; kubectl delete pv x) | kubectl config use-context prod' \
  '{ sleep 2; kubectl delete pv x; } | kubectl config use-context prod' \
  '(sleep 2; kubectl delete pv x) & kubectl config use-context prod' \
  'sleep 2 && kubectl delete pv x & kubectl config use-context prod; wait' \
  "timeout 5 sh -c 'sleep 2; kubectl delete pv x' & kubectl config use-context prod" \
  'watch -n1 kubectl delete pv x & kubectl config use-context prod' \
  'watch -n1 kubectl delete pv x; kubectl config use-context prod' \
  'kubectl delete pv x&kubectl config use-context prod' \
  'echo $(kubectl delete pv x) | kubectl config use-context prod' \
  "sh -c 'kubectl delete pv x' | kubectl config use-context prod"; do
  t "concurrent writer: $c" ask "$c"
  t "concurrent writer, subagent with token: $c" ask "$c" withtoken
done
t "a writer after an if block stays quiet" none 'if true; then kubectl delete pv x; fi; kubectl config use-context prod'
t "a kubeconfig read in another pipeline stage stays quiet" none 'kubectl config current-context | kubectl apply -f -'

# Review round 2: -h as another flag's value cannot turn off the check. With an ask verb among the
# positional words, help flags are ignored, so asking on `destroy --help` is expected.
t "pulumi destroy, -h as --event-log's value" ask "pulumi destroy --yes --event-log -h"
t "pulumi destroy, -h as a value, subagent without token" deny "pulumi destroy --yes --event-log -h" notoken
t "pulumi up, -h as --tracing-header's value" ask "pulumi up --yes --tracing-header -h"
t "helmfile sync, -h as --kustomize-binary's value" ask "helmfile sync --kustomize-binary -h"
t "helmfile destroy, -h as --cascade's value" ask "helmfile destroy --cascade -h"
t "helmfile -k -h sync" ask "helmfile -k -h sync"
t "helmfile -k -h sync, subagent without token" deny "helmfile -k -h sync" notoken
t "kubectl delete pv on prod, -h as --raw's value" deny "kubectl --context prod delete pv x --raw -h"
t "helm upgrade on prod, -h as --description's value" ask "helm --kube-context omni-prod upgrade x chart --description -h"
t "talosctl reset, -h as a value" ask "talosctl -n 10.0.0.1 reset --system-labels-to-wipe -h"
t "kubectl get --help on prod stays quiet" none "kubectl --context omni-prod get pods --help"
t "pulumi stack ls --help stays quiet" none "pulumi stack ls --help"
# A variable or substitution as the verb asks, and gates a subagent
t "pulumi verb from a variable" ask 'ACTION=destroy; pulumi "$ACTION" --yes'
t "pulumi verb from a variable, subagent without token" deny 'ACTION=destroy; pulumi "$ACTION" --yes' notoken
t "pulumi verb from an unset variable" ask 'pulumi $ACTION --yes'
t "pulumi verb from an unset variable, subagent without token" deny 'pulumi $ACTION --yes' notoken
t "pulumi verb from a substitution" ask 'pulumi $(echo destroy) --yes'
t "pulumi stack verb from a variable" ask 'pulumi stack $V dev --yes'
t "pulumi config set with a variable value stays quiet" none 'pulumi config set region $REGION'
t "pulumi stack select of a variable stays quiet" none 'pulumi stack select $STACK'
t "helmfile verb from a variable" ask 'ACTION=destroy; helmfile "$ACTION"'
t "helmfile verb from a variable, subagent without token" deny 'ACTION=destroy; helmfile "$ACTION"' notoken
t "helmfile verb from an unset variable" ask 'helmfile -e dev $ACTION'
t "helmfile diff with a variable environment stays quiet" none 'helmfile -e $ENV diff'
t "kubectl verb from a variable on prod" deny 'V=delete; kubectl --context prod $V pv x'
# mise exec runs the command after --, aliases included
t "mise exec tf destroy" deny "mise exec -- tf destroy"
t "mise x tg run-all destroy" deny "mise x -- tg run-all destroy"
t "mise exec k delete pv on prod" deny "mise exec -- k --context prod delete pv x"
t "mise exec with a tool spec, tf destroy" deny "mise exec terraform@1.9 -- tf destroy"
t "mise exec tf plan stays quiet" none "mise exec -- tf plan"
t "mise exec bash -c tofu destroy" deny "mise exec -- bash -c 'tofu destroy'"
# python -m awscli is aws wherever it appears; only pip install awscli is a package name
t "ssh runs python -m awscli" ask "ssh host python3 -m awscli ec2 terminate-instances --instance-ids i-1"
t "busybox xargs runs python -m awscli" ask "busybox xargs python3 -m awscli ec2 terminate-instances --instance-ids i-1"
t "python long option value before -m awscli" ask "python3 --check-hash-based-pycs always -m awscli ec2 terminate-instances --instance-ids i-1"
t "python long option value before -m awscli, subagent without token" deny "python3 --check-hash-based-pycs always -m awscli s3 ls" notoken
t "pip install of a pinned awscli stays quiet" none "python3 -m pip install awscli==1.32.0"
# nix: the subcommand word, option values, the first --, and versioned attributes
t "nix run kubectl with shell and -c among its arguments" deny "nix run nixpkgs#kubectl -- --context prod delete pv shell -c x"
t "nix run past an --option value holding a #" deny "nix run --option substituters https://cache.example#x nixpkgs#terraform -- destroy"
t "nix run terraform destroy before a later --" deny "nix run nixpkgs#terraform destroy -- -x"
t "nix run terraform_1 destroy" deny "nix run nixpkgs#terraform_1 -- destroy"
t "nix run kubernetes-helm-wrapped upgrade on prod" ask "nix run nixpkgs#kubernetes-helm-wrapped -- --kube-context omni-prod upgrade x chart"
t "nix env shell -c tofu destroy" deny "nix env shell nixpkgs#opentofu -c tofu destroy"
t "nix --option before shell -c" deny "nix --option sandbox false shell nixpkgs#terraform -c terraform destroy"
t "nix run terraform-docs is not terraform" none "nix run nixpkgs#terraform-docs -- markdown ."
t "nix run -- installable bash -c terraform destroy" deny "nix run -- nixpkgs#bash -c 'terraform destroy' --"
t "nix run -- installable terraform destroy" deny "nix run -- nixpkgs#terraform destroy"
t "nix run -- installable kubectl delete pv on prod" deny "nix run -- nixpkgs#kubectl --context prod delete pv x"
# pulumi credentialed reads: preview gates a subagent; --show-secrets and stack export print secrets
t "pulumi preview, subagent without token" deny "pulumi preview" notoken
t "pulumi pre, subagent without token" deny "pulumi pre" notoken
t "pulumi preview, subagent with token" none "pulumi preview" withtoken
t "pulumi stack output --show-secrets asks" ask "pulumi stack output --show-secrets"
t "pulumi config --show-secrets=true asks" ask "pulumi config --show-secrets=true"
t "pulumi stack output --show-secrets, subagent without token" deny "pulumi stack output --show-secrets" notoken
t "pulumi stack export asks" ask "pulumi stack export"
t "pulumi stack export, subagent without token" deny "pulumi stack export" notoken
t "pulumi stack export, subagent with token" none "pulumi stack export" withtoken
t "pulumi watch deploys continuously" ask "pulumi watch"
t "pulumi watch, subagent without token" deny "pulumi watch --stack dev" notoken

# The subagent deny names the main session and the user, never the token line itself
why "subagent deny: ask the user" "ask the user" "tofu plan" notoken
got=$(mkin "aws s3 ls" notoken | guard 2>/dev/null)
case $got in *"ALLOW: cloud-ops"*|'') bad "subagent deny omits the token line" "no token line" "$got" ;; *) ok "subagent deny omits the token line" ;; esac
got=$(mkin "aws s3 ls" nosuchagent | guard 2>/dev/null)
case $got in *"ALLOW: cloud-ops"*|'') bad "unreadable brief omits the token line" "no token line" "$got" ;; *) ok "unreadable brief omits the token line" ;; esac
why "unreadable brief: ask the user" "ask the user" "aws s3 ls" nosuchagent

# Non-matching
t "no tool" none "ls -la"
t "git commit mentioning tofu" none "git commit -m 'run tofu apply later'"
t "tofu-docs tool name" none "terraform-docs markdown ."
t "echo tool name alone" none "echo tofu"
t "which tofu" none "which tofu"
t "directory named terraform" none "cd terraform && ls"
raw "non-Bash tool" none '{"tool_name":"Read","tool_input":{"file_path":"x"}}'

# aws outside subagents is not ours to decide
t "aws main session" none "aws s3 ls"

# Subagent rule
t "subagent aws, no transcript" ask "aws s3 ls" nosuchagent
t "subagent aws, no token" deny "aws s3 ls" notoken
t "subagent aws, token" none "aws s3 ls" withtoken
t "subagent aws, token in content blocks" none "aws s3 ls" listtoken
t "subagent plan, no token" deny "tofu plan" notoken
t "subagent plan, token" none "tofu plan" withtoken
t "subagent mise plan, no token" deny "mise run tofu core plan" notoken
t "subagent terragrunt plan, no token" deny "terragrunt plan" notoken
t "subagent apply saved plan, no token" deny "tofu apply x.tfplan" notoken
t "subagent apply saved plan, token" none "tofu apply x.tfplan" withtoken
t "subagent apply still denied with token" deny "tofu apply -auto-approve" withtoken
t "subagent aws --version needs no token" none "aws --version" notoken
t "subagent traversal id" ask "aws s3 ls" "../../etc"
t "subagent meta line cannot grant the token" ask "tofu plan" metatoken
t "subagent brief after a meta line" none "tofu plan" metabrief
t "subagent meta token, brief without it" deny "tofu plan" metanotoken
t "subagent oversized transcript line" ask "tofu plan" bigline

# Failure handling
t "oversized command naming a tool" ask "tofu plan # $(printf 'x%.0s' $(seq 70000))"
t "oversized command without a tool" none "echo $(printf 'x%.0s' $(seq 70000))"
raw "malformed stdin" ask 'not json'
raw "empty stdin" ask ''
raw "missing command key" ask '{"tool_name":"Bash","tool_input":{}}'
raw "forced exception (tool_input is a list)" ask '{"tool_name":"Bash","tool_input":[]}'
raw "non-string command" ask '{"tool_name":"Bash","tool_input":{"command":5}}'

# Output never echoes the command
out=$(mkin "AWS_SECRET_ACCESS_KEY=hunter2 tofu apply -auto-approve" | guard)
case $out in *hunter2*) bad "output omits command text" "no secret" "leaked" ;; *) ok "output omits command text" ;; esac

# Fuzz: no dangerous suffix, prefix, or inserted shell character turns an allowed command into allow
fuzz=$(CLAUDE_PLUGIN_OPTION_AUTOALLOWREADONLY=true bun --no-env-file --config=/dev/null "$scripts/tests/fuzz.ts" "$root" "$sid")
read -r fuzz_n fuzz_bad <<<"$(printf '%s\n' "$fuzz" | head -1)"
if [ "${fuzz_bad:-x}" = 0 ]; then
  ok "fuzz: $fuzz_n variants of allowed commands, none allowed"
else
  bad "fuzz" "0 allowed variants" "$(printf '%s\n' "$fuzz" | tail -n +2)"
fi

echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
