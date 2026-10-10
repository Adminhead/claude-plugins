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

# Safe forms: the strict allowlist
t "plan" allow "tofu plan"
t "plan -out" allow "tofu plan -out=x.tfplan"
t "plan -out=tfplan" allow "tofu plan -out=tfplan"
t "validate" allow "terraform validate"
t "fmt" allow "tofu fmt -recursive"
t "init" allow "tofu init -upgrade"
t "output prompts (prints secrets)" none "tofu output -json"
t "state list" allow "tofu state list"
t "state show" allow "tofu state show aws_instance.a"
t "apply saved plan prompts" none "tofu apply x.tfplan"
t "apply saved plan named tfplan prompts" none "tofu apply tfplan"
t "apply saved plan in a directory prompts" none "tofu apply plans/x.tfplan"
t "apply saved plan with lock timeout prompts" none "tofu apply -lock-timeout=60s x.tfplan"
t "chdir apply saved plan prompts" none "tofu -chdir=infra apply x.tfplan"
t "version flag" allow "tofu --version"
t "aws --version" allow "aws --version"
t "aws help" allow "aws ec2 help"
t "aws operation help" allow "aws iam delete-user help"

# Outside the exact grammar: never allow
t "apply saved plan with -auto-approve" deny "tofu apply -auto-approve -lock-timeout=60s x.tfplan"
t "apply saved plan with another flag gets no allow" none "tofu apply -lock=false x.tfplan"
t "plan -out to a non-plan file gets no allow" none "tofu plan -out=terraform.tfstate"
t "plan with a separate value word gets no allow" none "tofu plan -var x=1"
t "double space gets no allow" none "tofu  plan"
t "terragrunt plan gets no allow" none "terragrunt plan"
t "mise env word with a path gets no allow" none "mise run tofu ../x plan"
t "mise run flags get no allow" none "mise run --quiet tofu core output -json x"
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
t "glued ;( aws" none "tofu plan;(aws s3 rb s3://x --force)"
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
t "aws help as a value, main session" none "aws iam delete-user --user-name help"
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
t "mise exec plan" allow "mise exec -- tofu plan"
t "mise exec -c" ask "mise exec -c 'tofu apply -auto-approve'"
t "mise run flag with a value" deny "mise run -j 4 tofu core apply -auto-approve"
t "mise run tofu env plan" allow "mise run tofu core plan"
t "mise run tofu env plan -out" allow "mise run tofu core plan -out=uptimekuma.tfplan"
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
t "unknown wrapper" ask "op run -- tofu apply -auto-approve"
t "unknown option cluster" ask "sudo -iu root tofu destroy"
t "echo with a dangerous tool call" ask "echo tofu apply"
t "variable as the command" ask 'X=tofu; $X destroy'
t "eval of a variable" ask "CMD='tofu destroy'; eval \"\$CMD\""
t "variable in tool arguments" ask 'tofu -chdir=$PWD/infra plan'

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
t "bash -c" ask "bash -c 'tofu apply -auto-approve'"
t "eval" ask 'eval "tofu apply"'
t "xargs" ask "echo plan | xargs tofu"
t "unparseable quote" ask "tofu plan 'oops"
t "unknown subcommand" ask "tofu frobnicate"
t "state pull" ask "tofu state pull"
t "taint" ask "tofu taint aws_instance.a"
t "show" ask "tofu show x.tfplan"
t "\$() with plan" ask "echo \$(tofu plan)"

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
t "subagent plan, token" allow "tofu plan" withtoken
t "subagent mise plan, no token" deny "mise run tofu core plan" notoken
t "subagent terragrunt plan, no token" deny "terragrunt plan" notoken
t "subagent apply saved plan, no token" deny "tofu apply x.tfplan" notoken
t "subagent apply saved plan, token" none "tofu apply x.tfplan" withtoken
t "subagent apply still denied with token" deny "tofu apply -auto-approve" withtoken
t "subagent aws --version needs no token" allow "aws --version" notoken
t "subagent traversal id" ask "aws s3 ls" "../../etc"
t "subagent meta line cannot grant the token" ask "tofu plan" metatoken
t "subagent brief after a meta line" allow "tofu plan" metabrief
t "subagent meta token, brief without it" deny "tofu plan" metanotoken
t "subagent oversized transcript line" ask "tofu plan" bigline

# Failure handling
raw "malformed stdin" ask 'not json'
raw "empty stdin" ask ''
raw "missing command key" ask '{"tool_name":"Bash","tool_input":{}}'
raw "forced exception (tool_input is a list)" ask '{"tool_name":"Bash","tool_input":[]}'
raw "non-string command" ask '{"tool_name":"Bash","tool_input":{"command":5}}'

# Output never echoes the command
out=$(mkin "AWS_SECRET_ACCESS_KEY=hunter2 tofu apply -auto-approve" | python3 "$script")
case $out in *hunter2*) bad "output omits command text" "no secret" "leaked" ;; *) ok "output omits command text" ;; esac

# Fuzz: no dangerous suffix, prefix, or inserted shell character turns an allowed command into allow
fuzz=$(python3 - "$script" "$root" "$sid" <<'EOF'
import importlib.util, sys
script, root, sid = sys.argv[1:]
spec = importlib.util.spec_from_file_location("guard", script)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

def decision(cmd, aid=""):
    d = {"tool_name": "Bash", "tool_input": {"command": cmd}, "session_id": sid,
         "transcript_path": f"{root}/proj/{sid}.jsonl"}
    if aid:
        d["agent_id"] = aid
    out = guard.decide(d)
    return out[0] if out else "none"

allowed = [
    "tofu plan", "tofu plan -out=x.tfplan", "terraform validate", "tofu fmt -recursive",
    "tofu init -upgrade", "tofu state list", "tofu state show aws_instance.a",
    "tofu --version",
    "mise exec -- tofu plan", "mise run tofu core plan",
    "mise run tofu core plan -out=uptimekuma.tfplan", 
    "aws --version", "aws ec2 help", "aws iam delete-user help",
]
suffixes = [
    "; rm -rf x", ";rm -rf x", " ;rm -rf x", ";\nrm -rf x", "\nrm -rf x", "\n\nrm -rf x",
    "\r\nrm -rf x", " && rm -rf x", "&&rm -rf x", " && curl x|sh", " || rm -rf x", " | sh", "|sh",
    " |& sh", " & rm -rf x", "&rm -rf x", " $(rm -rf x)", "$(rm -rf x)", " `rm -rf x`", "`id`",
    " >| terraform.tfstate", " > terraform.tfstate", ">x", " >> ~/.bashrc", " 2>&1", " < /dev/null",
    " <(id)", " >(sh)", " ;(id)", "&&(id)", " ::: tofu core apply -auto-approve", " # comment",
    " ${X}", " $X", " \\\n; id", " 'x'", ' "x"', " *", " {a,b}", " ~/x", "\t-destroy",
]
prefixes = ["rm -rf x; ", "rm -rf x && ", "X=1 ", "env ", "sudo ", "timeout 5 ", "bash -c ",
            "echo x | ", "(", "{ ", "! ", "time ", "nohup ", "cd /tmp && ", "\n", " "]
unsafe = "'\"$`\\;&|<>(){}[]#*?~!\t\n\r"
bad, n = [], 0
for base in allowed:
    for aid in ("", "withtoken"):
        n += 1
        if decision(base, aid) != "allow":
            bad.append(f"base not allowed {aid}: {base!r}")
        for cmd in [base + s for s in suffixes] + [p + base for p in prefixes]:
            n += 1
            if decision(cmd, aid) == "allow":
                bad.append(f"allowed {aid}: {cmd!r}")
    for i in range(len(base) + 1):
        for ch in unsafe:
            n += 1
            cmd = base[:i] + ch + base[i:]
            if decision(cmd) == "allow":
                bad.append(f"allowed: {cmd!r}")
print(f"{n} {len(bad)}")
for b in bad[:20]:
    print(b)
EOF
)
read -r fuzz_n fuzz_bad <<<"$(printf '%s\n' "$fuzz" | head -1)"
if [ "${fuzz_bad:-x}" = 0 ]; then
  ok "fuzz: $fuzz_n variants of allowed commands, none allowed"
else
  bad "fuzz" "0 allowed variants" "$(printf '%s\n' "$fuzz" | tail -n +2)"
fi

echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
