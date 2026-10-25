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


def grade(expect, tr, log):
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
        got = agents[0]["input"].get("subagent_type")
        want = expect["first_agent"]
        if got not in (want if isinstance(want, list) else [want]):
            return False, f"first agent {got}"
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
    arms = args[args.index("--arms") + 1].split(",") if "--arms" in args else ["A", "B"]
    verbose = "-v" in args
    pos = [a for i, a in enumerate(args) if not a.startswith("-") and (i == 0 or args[i - 1] not in ("--case", "--arms"))]
    if not pos:
        sys.exit("usage: grade.py RUN_DIR [--case NAME[,NAME]] [--arms A,B,C,D] [-v]")
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
            res, nerr = [], 0
            for r in runs:
                tr, log = load(r)
                err = errored(r, tr)
                if err:
                    nerr += 1
                    errs[arm] += 1
                    print(f"  [{c['name']} {r.name}] ERROR: {err} (excluded)")
                    continue
                ok, why = grade(c["expect"], tr, log)
                m = metrics(tr)
                res.append(ok)
                skill[arm][1] += 1
                skill[arm][0] += skill_loaded(tr)
                if m:
                    agg[arm].append(m)
                if verbose or not ok:
                    first = next((u["input"].get("subagent_type") for u in tool_uses(tr) if u["name"] in AGENT_TOOLS), None)
                    print(f"  [{c['name']} {r.name}] {'PASS' if ok else 'FAIL'}: {why} (first agent: {first})")
            cell[arm] = (f"{sum(res)}/{len(res)}" if res else "-") + (f"+{nerr}E" if nerr else "")
        rows.append((c["name"], [cell[a] for a in arms]))
    print(f"\n{'case':<24}" + "".join(f"{a + ' pass':>10}" for a in arms) + "   (nE = errored runs, excluded)")
    for n, cells in rows:
        print(f"{n:<24}" + "".join(f"{x:>10}" for x in cells))
    print(f"\n{'arm':<5}{'runs':>5}{'errors':>7}{'skill loaded':>13}{'mean in-tokens':>16}{'mean cost $':>13}{'mean turns':>12}{'mean ms':>10}")
    for arm in arms:
        ms = agg[arm]
        sk = f"{skill[arm][0]}/{skill[arm][1]}"
        print(f"{arm:<5}{len(ms):>5}{errs[arm]:>7}{sk:>13}{mean([m[0] for m in ms]):>16.0f}{mean([m[1] for m in ms]):>13.4f}"
              f"{mean([m[2] for m in ms]):>12.1f}{mean([m[3] for m in ms]):>10.0f}")


main()
