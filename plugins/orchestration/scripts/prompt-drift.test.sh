#!/usr/bin/env bash
# Smoke test for prompt-drift.sh against a synthetic 2.1.302-shaped binary, mutated one drift at a time.
set -euo pipefail

script=$(cd "$(dirname "$0")" && pwd)/prompt-drift.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

# Pull the expected phrases out of the script so the fixture tracks them.
mapfile -t phrases < <(sed -n "/^keep_phrases=(/,/^)/p" "$script" | sed -n "s/^  '[^|]*|\(.*\)'\$/\1/p" | sed "s/'\"'\"'/'/g")
((${#phrases[@]} > 0)) || fail "could not read phrases from script"

cat >"$tmp/good" <<'EOF'
var Ho=o.appendSystemPrompt;if(o.appendSystemPromptFile){if(x)return 1;try{let h=no(o.appendSystemPromptFile);Ho=Tr(bJr(await rl(h)),o.appendSystemPrompt)}catch(h){return an(`Error: Append system prompt file not found: ${h}`)}}
let{systemPrompt:$o,appendSystemPrompt:He}=fhs({cli:{systemPrompt:Kn,appendSystemPrompt:Ho},env:process.env,settings:ft()});
Ht=p2({mainThreadAgentDefinition:at,toolUseContext:vt,customSystemPrompt:Le,defaultSystemPrompt:Pt,appendSystemPrompt:Fe});
function hHo({mainThreadAgentDefinition:e,toolUseContext:n,customSystemPrompt:r,defaultSystemPrompt:s,appendSystemPrompt:h,overrideSystemPrompt:y,analysisOnly:S}){if(y)return{prompt:wi([y]),servesDefault:!1};let w=e?e.getSystemPrompt():void 0,H=i3e(r,s),K=H===s,V={tools:n.options.tools,appendSystemPrompt:h};if(w&&e?.appendSystemPrompt)return{prompt:wi(eBe([...H,w],V)),servesDefault:K};return{prompt:wi(eBe(w?[w]:H,V)),servesDefault:!w&&K}}
function eBe(e,{tools:n,memoryMechanicsPrompt:r,appendSystemPrompt:s}){return tBn(e,[["session",r],["shared",ykr(n)],["session",s]],iJ())}
var Wf=["name","description","prompt","tools","disallowedTools","model","effort","permissionMode","mcpServers","hooks","maxTurns","skills","isolation"];
overrideSystemPrompt
he=1,_e=[Jp(`communication${S}`,()=>a(s)),Jp("pronouns",()=>q),Jp(`action_caution${S}`,()=>b(s)),Jp("task_continuity",()=>w(y)),Jp(U0o,()=>G(n)),Jp("tool_param_json",()=>k("tengu_x",!1)?z:null),Jp(`session_guidance${S}:${xV()}`,()=>c()),Jp(`memory${S}`,async()=>Q()),...S?[Jp(`surface:${q()}`,()=>F())]:[],Jp(`${r?.x?"env_info_static":"env_info_simple"}${w}`,()=>S()),Jp("bg-session",()=>b()),Jp("context_management",()=>w),...S?[Jp(`system_messages${H}`,()=>W())]:[],Jp("brief",()=>o()),Jp(`focus_mode${S}`,()=>i(s)),Jp("act_dont_rederive",()=>m()?g:null),Jp("delivering_work_max",()=>X),Jp("overcorrection",()=>Q),Jp("subagent_steer_delegation",()=>Y),Jp("opus5_reduced_delegation",()=>{return 1}),Jp("heron_brook",()=>P()),Jp("brook_heron",()=>D(s)),Jp("willow_tern",()=>I(s)),Jp("autonomy_append",()=>L(h,s)),Jp("endconv_deferred_hint",()=>{return null})],
ke=1,be=h?[["lean_body",p(G,n)]]:[["intro",n(G)],["system",s(n)],["doing_tasks",i()],["actions",a()],["tools",d(V)],["tone",f()]];return[...hIe("shared",[...be,["memory_static",b(s)]]),...hIe("session",[..._e.map((Te,Re)=>[Te.name,ke[Re]??null]),["total_tokens",z5t(n,void 0)],["user_pays",lBo()],["repl_working",_Bo(h)]])]
EOF
printf '%s\n' "${phrases[@]}" >>"$tmp/good"

# expect NAME EXIT PATTERN SED_EXPR: mutate the fixture and check exit code and message.
expect() {
  local name=$1 want=$2 pattern=$3 expr=$4 rc=0 out
  sed "$expr" "$tmp/good" >"$tmp/bin"
  out=$("$script" "$tmp/bin" 2>&1) || rc=$?
  ((rc == want)) || fail "$name: exit $rc, want $want ($out)"
  [[ $out == *"$pattern"* ]] || fail "$name: output lacks '$pattern': $out"
}

expect "unmodified fixture passes" 0 "prompt-drift: ok" 's/^$//'
expect "append flag no longer read" 1 "anchor missing: --append-system-prompt-file is read" 's/appendSystemPromptFile/appendPromptPath/g'
expect "append error text gone" 1 "anchor missing: 'Append system prompt file not found'" 's/Append system prompt file not found/Append file missing/'
expect "override call site added" 1 "overrideSystemPrompt appears 3 times" 's/^Ht=p2({/Ht=p2({overrideSystemPrompt:z,/'
expect "resolver call reshaped" 1 "anchor missing: that variable is passed" 's/{cli:{systemPrompt:/{opts:{systemPrompt:/'
expect "render call reshaped" 1 "anchor missing: main-thread render" 's/^Ht=p2({mainThreadAgentDefinition:at,/Ht=p2({agent:at,/'
expect "agent no longer replaces body" 1 "anchor missing: selector lets the agent" 's/eBe(w?\[w\]:H,V)/eBe([...H,w],V)/'
expect "append no longer last" 1 "anchor missing: selector lets the agent" 's/\["session",s\]\],iJ())/["session",s],["shared",x]],iJ())/'
expect "whitelist gone" 1 "anchor missing: agent frontmatter whitelist" 's/"isolation"\]/"isolated"]/'
expect "whitelist gains appendSystemPrompt (notice only)" 0 "notice: agent frontmatter whitelist now includes appendSystemPrompt" 's/"hooks","maxTurns"/"hooks","appendSystemPrompt","maxTurns"/'
expect "override gone" 1 "overrideSystemPrompt appears 0 times" '/overrideSystemPrompt/d'
expect "slot removed" 1 "removed [brief]" 's/Jp("brief",()=>o()),//'
expect "slot added" 1 "added [new_slot]" 's/Jp("brief"/Jp("new_slot",()=>1),Jp("brief"/'
expect "slots reordered" 1 "slots reordered" 's/Jp("pronouns",()=>q),//; s/Jp("brief"/Jp("pronouns",()=>q),Jp("brief"/'
expect "phrase gone" 1 "kept phrase gone (s2): never infer" 's/never infer pronouns from a name/xx/'

"$script" -h | grep -q '^Usage: prompt-drift' || fail "help"
if "$script" /nonexistent 2>/dev/null; then fail "missing binary accepted"; fi

echo "all prompt-drift checks passed"
