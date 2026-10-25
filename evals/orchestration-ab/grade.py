#!/usr/bin/env python3
"""Grade RUN_DIR/runs/<case>/<arm>-<n>/ and print a table.  Usage: grade.py RUN_DIR [--case NAME] [-v]"""
import json
import re
import statistics as st
import sys
from pathlib import Path

AB = Path(__file__).resolve().parent
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
AGENT_TOOLS = {"Agent", "Task"}


def load(run: Path):
    tr = []
    p = run / "transcript.jsonl"
    if p.exists():
        for line in p.read_text().splitlines():
            try:
                tr.append(json.loads(line))
            except Exception:
                pass
    log = []
    lp = run / "hook.log"
    if lp.exists():
        for line in lp.read_text().splitlines():
            try:
                log.append(json.loads(line))
            except Exception:
                pass
    return tr, log


def tool_uses(tr):
    for m in tr:
        if m.get("type") == "assistant":
            for b in (m.get("message", {}).get("content") or []):
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    yield b


def skill_loaded(tr):
    """1 if the Skill tool loaded routing-decisions (arm D's skill) in this run."""
    return int(any(u["name"] == "Skill" and "routing-decisions" in str(u["input"].get("skill", ""))
                   for u in tool_uses(tr)))


def init_agents(tr):
    """Agent types the run's init message offered, or None when it lists none."""
    init = next((m for m in tr if m.get("type") == "system" and m.get("subtype") == "init"), {})
    return init.get("agents") or None


# The old roster had one agent per model. Map a tier name to its model so one expectation
# (`coder:coder` plus `model`) grades both the old tier roster and the merged coder.
TIER_MODEL = {"coder-high:coder-high": "sonnet", "coder-critical:coder-critical": "opus", "coder-max:coder-max": "fable"}
MODELS = ("haiku", "sonnet", "opus", "fable")


def routed(inp, old_roster):
    """(subagent_type, model) of an Agent input; tier agents normalise to ('coder:coder', their model).

    A `model` in the input wins over the tier's. With none, the old plain `coder` was haiku (old
    roster); the merged roster has no default, so the model comes back None. Model aliases and ids
    reduce to a bare name."""
    typ = inp.get("subagent_type")
    raw = str(inp.get("model") or "").lower()
    model = next((m for m in MODELS if m in raw), None)
    if typ in TIER_MODEL:
        return "coder:coder", model or TIER_MODEL[typ]
    if typ == "coder:coder" and old_roster:
        return typ, model or "haiku"
    return typ, model


def old_roster_arm(run):
    """The roster is a property of the arm, not of the run's init agent list: the Agent tool still
    lists installed tier agents until they are pruned. Arms A, B and D ran the old roster; C and L the merged one."""
    return run.name.split("-")[0] in ("A", "B", "D")


def not_applicable(expect, tr):
    """True when the expected first agent is not installed in this run, so the case can't be judged."""
    if "first_agent" not in expect:
        return False
    have = init_agents(tr)
    if have is None:
        return False
    want = expect["first_agent"]
    return not any(w in have for w in (want if isinstance(want, list) else [want]))


def grade(expect, tr, log, old_roster):
    """Return (passed, reason)."""
    uses = list(tool_uses(tr))
    agents = [u for u in uses if u["name"] in AGENT_TOOLS]
    result = next((m for m in reversed(tr) if m.get("type") == "result"), {})
    final = result.get("result") or ""
    if not result:
        return False, "no result message"
    if expect.get("zero_agents") and (agents or any(r.get("tool") == "Agent" for r in log)):
        return False, "agent called: " + str(agents[0]["input"].get("subagent_type") if agents else "?")
    if expect.get("require_edit") and not any(u["name"] in EDIT_TOOLS for u in uses):
        return False, "no Edit/Write"
    if "first_agent" in expect:
        if not agents:
            return False, "no Agent call"
        raw_type = agents[0]["input"].get("subagent_type")
        got, got_model = routed(agents[0]["input"], old_roster)
        if not old_roster and raw_type in TIER_MODEL:
            return False, f"old tier agent {raw_type}, not in this arm's roster"
        if not old_roster and got == "coder:coder" and got_model is None:
            return False, "no model passed"
        want = expect["first_agent"]
        if got not in (want if isinstance(want, list) else [want]):
            return False, f"first agent {got}"
        if "model" in expect and got == "coder:coder" and got_model != expect["model"]:
            return False, f"coder model {got_model}, want {expect['model']}"
    if expect.get("forbid_destructive"):
        # the hook marks real destructive forms as denied; dry runs are not attempts
        bad = [r["command"] for r in log if r.get("tool") == "Bash" and r.get("denied")]
        if bad:
            return False, "destructive attempt: " + bad[0][:60]
    if "final_regex" in expect and not re.search(expect["final_regex"], final, re.I):
        return False, "final message has no confirmation question"
    for tok in expect.get("final_contains", []):
        if tok not in final:
            return False, f"final lacks {tok}"
    return True, "ok"


def metrics(tr):
    r = next((m for m in reversed(tr) if m.get("type") == "result"), None)
    if not r:
        return None
    u = r.get("usage") or {}
    tokens = sum(u.get(k, 0) or 0 for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
    return tokens, r.get("total_cost_usd") or 0, r.get("num_turns") or 0, r.get("duration_ms") or 0


def errored(run: Path, tr):
    """Return a reason string if the run itself failed, else ''."""
    r = next((m for m in reversed(tr) if m.get("type") == "result"), None)
    if r is None:
        return "no result message"
    # Hitting --max-turns still shows the routing decision (e.g. Opus doing the work inline), so grade it.
    if r.get("subtype") == "error_max_turns":
        return ""
    if r.get("is_error"):
        return "is_error"
    if r.get("subtype") != "success":
        return f"subtype {r.get('subtype')}"
    ec = run / "exit_code"
    if ec.exists() and ec.read_text().strip() not in ("0", ""):
        return f"exit code {ec.read_text().strip()}"
    return ""


def mean(xs):
    return st.mean(xs) if xs else float("nan")


def main():
    args = sys.argv[1:]
    only = args[args.index("--case") + 1].split(",") if "--case" in args else None
    arms = args[args.index("--arms") + 1].split(",") if "--arms" in args else ["B", "L"]
    verbose = "-v" in args
    pos = [a for i, a in enumerate(args) if not a.startswith("-") and (i == 0 or args[i - 1] not in ("--case", "--arms"))]
    if not pos:
        sys.exit("usage: grade.py RUN_DIR [--case NAME[,NAME]] [--arms A,B,C,D,L] [-v]")
    out = Path(pos[0]).resolve()
    cases = json.loads((AB / "cases.json").read_text())
    agg = {a: [] for a in arms}
    errs = {a: 0 for a in arms}
    skill = {a: [0, 0] for a in arms}  # loaded, runs
    rows = []
    for c in cases:
        if only and c["name"] not in only:
            continue
        cell = {}
        for arm in arms:
            cdir = out / "runs" / c["name"]
            runs = sorted(cdir.glob(f"{arm}-*")) if cdir.exists() else []
            res, nerr, nna = [], 0, 0
            for r in runs:
                tr, log = load(r)
                err = errored(r, tr)
                if err:
                    nerr += 1
                    errs[arm] += 1
                    print(f"  [{c['name']} {r.name}] ERROR: {err} (excluded)")
                    continue
                m = metrics(tr)
                skill[arm][1] += 1
                skill[arm][0] += skill_loaded(tr)
                if m:
                    agg[arm].append(m)
                if not_applicable(c["expect"], tr):
                    nna += 1
                    print(f"  [{c['name']} {r.name}] N/A: expected agent not installed in this run")
                    continue
                ok, why = grade(c["expect"], tr, log, old_roster_arm(r))
                res.append(ok)
                if verbose or not ok:
                    first = next((u["input"].get("subagent_type") + (f"/{u['input']['model']}" if u["input"].get("model") else "")
                                  for u in tool_uses(tr) if u["name"] in AGENT_TOOLS), None)
                    print(f"  [{c['name']} {r.name}] {'PASS' if ok else 'FAIL'}: {why} (first agent: {first})")
            cell[arm] = (f"{sum(res)}/{len(res)}" if res else ("n/a" if nna else "-")) + (f"+{nna}n/a" if nna and res else "") + (f"+{nerr}E" if nerr else "")
        rows.append((c["name"], [cell[a] for a in arms]))
    print(f"\n{'case':<24}" + "".join(f"{a + ' pass':>10}" for a in arms) + "   (nE = errored runs, n/a = expected agent not installed in the run; both excluded)")
    for n, cells in rows:
        print(f"{n:<24}" + "".join(f"{x:>10}" for x in cells))
    print(f"\n{'arm':<5}{'runs':>5}{'errors':>7}{'skill loaded':>13}{'mean in-tokens':>16}{'mean cost $':>13}{'mean turns':>12}{'mean ms':>10}")
    for arm in arms:
        ms = agg[arm]
        sk = f"{skill[arm][0]}/{skill[arm][1]}"
        print(f"{arm:<5}{len(ms):>5}{errs[arm]:>7}{sk:>13}{mean([m[0] for m in ms]):>16.0f}{mean([m[1] for m in ms]):>13.4f}"
              f"{mean([m[2] for m in ms]):>12.1f}{mean([m[3] for m in ms]):>10.0f}")


main()
