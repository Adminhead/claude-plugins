#!/usr/bin/env bash
# Offline tests for scripts/cloud-ops-guard.py: feeds PreToolUse JSON, checks the decision.
set -u

script=$(cd "$(dirname "$0")/.." && pwd)/cloud-ops-guard.py
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

pass=0 fail=0
ok() { pass=$((pass + 1)); echo "ok   $1"; }
bad() { fail=$((fail + 1)); echo "FAIL $1 (expected $2, got $3)"; }

# Subagent transcript fixtures: <root>/proj/<sid>/subagents/agent-<id>.jsonl
sid=11111111-2222-3333-4444-555555555555
mkdir -p "$root/proj/$sid/subagents"
python3 - "$root" "$sid" <<'EOF'
import json, sys
root, sid = sys.argv[1:]
def w(aid, content):
    with open(f"{root}/proj/{sid}/subagents/agent-{aid}.jsonl", "w") as f:
        f.write(json.dumps({"type": "user", "message": {"role": "user", "content": content}}) + "\n")
w("withtoken", "Do the thing.\nALLOW: cloud-ops\nThanks.")
w("notoken", "Do the thing. ALLOW: cloud-ops inline is not a whole line.")
w("listtoken", [{"type": "text", "text": "ALLOW: cloud-ops"}])
EOF

decision() { # stdin JSON -> decision word or "none"
  local out
  out=$(python3 "$script" 2>/dev/null)
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
raw() { # name expected raw-stdin
  local got
  got=$(printf '%s' "$3" | decision)
  if [ "$got" = "$2" ]; then ok "$1"; else bad "$1" "$2" "$got"; fi
}

# Safe forms
t "plan" allow "tofu plan"
t "plan -out" allow "tofu plan -out=x.tfplan"
t "validate" allow "terraform validate"
t "fmt" allow "tofu fmt -recursive"
t "init" allow "tofu init -upgrade"
t "output" allow "tofu output -json"
t "state list" allow "tofu state list"
t "state show" allow "tofu state show aws_instance.a"
t "apply saved plan" allow "tofu apply x.tfplan"
t "apply saved plan with flags" allow "tofu apply -auto-approve -lock-timeout=60s x.tfplan"
t "chdir apply saved plan" allow "tofu -chdir=infra apply x.tfplan"
t "version flag" allow "tofu --version"
t "aws --version" allow "aws --version"
t "aws help" allow "aws ec2 help"

# Deny
t "apply interactive" deny "tofu apply"
t "apply -auto-approve" deny "tofu apply -auto-approve"
t "apply -target no plan" deny "tofu apply -target=aws_instance.a"
t "apply -var value is not a plan" deny "tofu apply -var x=1"
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

# Wrappers and prefixes
t "VAR= prefix apply" deny "AWS_PROFILE=x tofu apply -auto-approve"
t "VAR= prefix plan" allow "AWS_PROFILE=x TF_LOG=0 tofu plan"
t "env wrapper" deny "env TF_IN_AUTOMATION=1 tofu apply"
t "sudo wrapper" deny "sudo -u root tofu destroy"
t "absolute path" deny "/usr/local/bin/tofu apply -auto-approve"
t "mise exec" deny "mise exec -- tofu apply -auto-approve"
t "mise exec plan" allow "mise exec -- tofu plan"
t "mise run tofu env plan" allow "mise run tofu core plan"
t "mise run tofu env plan -out" allow "mise run tofu core plan -out=uptimekuma.tfplan"
t "mise run tofu env apply saved" allow "mise run tofu core apply uptimekuma.tfplan"
t "mise run tofu env apply -auto-approve" deny "mise run tofu authentik apply -auto-approve"
t "mise run tofu env destroy" deny "mise run tofu lab destroy"
t "mise run tofu no env" allow "mise run tofu plan"

# Compound, quoted, and constructs
t "plan; apply" deny "tofu plan;tofu apply -auto-approve"
t "&& apply" deny "cd infra && tofu apply -auto-approve"
t "|| apply" deny "tofu validate || tofu apply"
t "pipe apply" deny "yes | tofu apply"
t "newline apply" deny $'tofu plan\ntofu apply'
t "background apply" deny "tofu plan & tofu apply"
t "plan then plan" allow "tofu plan && tofu plan -out=a.tfplan"
t "plan with unchecked segment" none "cd infra && tofu plan"
t "plan piped to tail" none "tofu plan | tail -20"
t "plan with redirect" none "tofu plan > out.txt"
t "plan 2>&1 no allow" none "tofu plan 2>&1"
t "quoted separator is one word" none "echo 'tofu apply; tofu destroy'"
t "quoted arg stays safe" allow "tofu plan -var 'a=b;c'"
t "\$() apply (deny outranks ask)" deny "echo \$(tofu apply -auto-approve)"
t "backticks" ask 'echo `tofu plan`'
t "\$() in args" ask 'tofu plan -var "x=$(date)"'
t "bash -c" ask "bash -c 'tofu apply -auto-approve'"
t "eval" ask 'eval "tofu apply"'
t "xargs" ask "echo plan | xargs tofu"
t "heredoc with apply (deny outranks ask)" deny $'cat <<EOF | sh\ntofu apply\nEOF'
t "unparseable quote" ask "tofu plan 'oops"
t "unknown subcommand" ask "tofu frobnicate"
t "state pull" ask "tofu state pull"
t "taint" ask "tofu taint aws_instance.a"
t "show" ask "tofu show x.tfplan"

t "\$() with plan" ask "echo \$(tofu plan)"
t "heredoc with plan" ask $'cat <<EOF | sh\ntofu plan\nEOF'

# Non-matching
t "no tool" none "ls -la"
t "git commit mentioning tofu" none "git commit -m 'run tofu apply later'"
t "tofu-docs tool name" none "terraform-docs markdown ."
t "echo tofu" none "echo tofu apply"
raw "non-Bash tool" none '{"tool_name":"Read","tool_input":{"file_path":"x"}}'

# aws outside subagents is not ours to decide
t "aws main session" none "aws s3 ls"

# Subagent rule
t "subagent aws, no transcript" ask "aws s3 ls" nosuchagent
t "subagent aws, no token" deny "aws s3 ls" notoken
t "subagent aws, token" none "aws s3 ls" withtoken
t "subagent aws, token in content blocks" none "aws s3 ls" listtoken
t "subagent plan, no token" deny "tofu plan" notoken
t "subagent plan, token" allow "tofu plan" withtoken
t "subagent mise plan, no token" deny "mise run tofu core plan" notoken
t "subagent terragrunt plan, no token" deny "terragrunt plan" notoken
t "subagent apply still denied with token" deny "tofu apply -auto-approve" withtoken
t "subagent aws --version needs no token" allow "aws --version" notoken
t "subagent traversal id" ask "aws s3 ls" "../../etc"

# Failure handling
raw "malformed stdin" ask 'not json'
raw "empty stdin" ask ''
raw "missing command key" ask '{"tool_name":"Bash","tool_input":{}}'
raw "forced exception (tool_input is a list)" ask '{"tool_name":"Bash","tool_input":[]}'
raw "non-string command" ask '{"tool_name":"Bash","tool_input":{"command":5}}'

# Output never echoes the command
out=$(mkin "AWS_SECRET_ACCESS_KEY=hunter2 tofu apply -auto-approve" | python3 "$script")
case $out in *hunter2*) bad "output omits command text" "no secret" "leaked" ;; *) ok "output omits command text" ;; esac

echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
