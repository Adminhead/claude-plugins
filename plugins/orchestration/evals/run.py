#!/usr/bin/env python3
"""Routing eval for the orchestration prompt.

`claude plugin eval` cannot run this suite: it only passes EVAL_* variables to the child, so it cannot set
CLAUDE_ORCHESTRATE=1 (which makes agent-router list the roster), and it has no flag to append a file as the
system prompt or to load an extra plugin dir as the roster. This runner starts `claude -p` the way
scripts/claude-orchestrate does (prompt body appended, CLAUDE_ORCHESTRATE=1) against stub roster plugins built
from the real agents' frontmatter, stops each run at the first Agent tool call, and grades that call.

Usage: run.py --model sonnet|opus [--runs 3] [-j 4] [--case GLOB] [--out DIR] [--budget-usd 0.8]
Cases: cases/<name>/{task.md, case.json, fixture/}. case.json keys:
  agent    short agent type of the first Agent call, or "none" for no Agent call
  model    allowed `model` values of that call (substring match, case-insensitive)
  model_not forbidden model values
  effort   allowed `effort` values
  never    agent types that must not be called (checked on every Agent call seen)
"""
import argparse, concurrent.futures as cf, fnmatch, json, os, re, shutil, subprocess, sys, tempfile, threading, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLUGINS = HERE.parent.parent
ROSTER = ["coder", "debugger", "architect", "reviewer", "security-auditor"]
STUB_BODY = "You are a stub in a routing test. Reply with exactly `stub done` and stop. Do not use any tool.\n"
print_lock = threading.Lock()


def frontmatter_field(text, key):
    m = re.search(rf"^{key}:\s*(.*)$", text.split("---", 2)[1], re.M)
    return m.group(1).strip() if m else None


def build_roster(root):
    """One stub plugin per roster agent, keeping the real name and description so the router table matches."""
    dirs = []
    for name in ROSTER:
        src = (PLUGINS / name / "agents" / f"{name}.md").read_text()
        d = root / name
        (d / ".claude-plugin").mkdir(parents=True)
        (d / "agents").mkdir()
        (d / ".claude-plugin" / "plugin.json").write_text(json.dumps({"name": name, "version": "0.0.0", "description": "eval stub"}))
        desc = frontmatter_field(src, "description")
        (d / "agents" / f"{name}.md").write_text(f"---\nname: {name}\ndescription: {desc}\nmodel: haiku\ntools: Read\n---\n{STUB_BODY}")
        dirs.append(d)
    return dirs


def build_prompt(root):
    text = (PLUGINS / "orchestration" / "agents" / "orchestration.md").read_text()
    p = root / "orchestration-prompt.md"
    p.write_text(text.split("---", 2)[2].lstrip("\n"))
    return p


def run_one(case, n, model, roster_dirs, prompt_file, out, budget):
    cdir = HERE / "cases" / case
    spec = json.loads((cdir / "case.json").read_text())
    work = Path(tempfile.mkdtemp(prefix=f"orch-eval-{case}-"))
    shutil.copytree(cdir / "fixture", work, dirs_exist_ok=True)
    cmd = ["claude", "-p", (cdir / "task.md").read_text(), "--model", model, "--output-format", "stream-json", "--verbose",
           "--append-system-prompt-file", str(prompt_file), "--setting-sources", "", "--strict-mcp-config",
           "--no-session-persistence", "--permission-mode", "default", "--max-turns", "8", "--max-budget-usd", str(budget),
           "--disallowedTools", "Bash", "WebFetch", "WebSearch", "Workflow"]
    cmd += [x for d in roster_dirs + [PLUGINS / "agent-router"] for x in ("--plugin-dir", str(d))]
    env = dict(os.environ, CLAUDE_ORCHESTRATE="1")
    t0 = time.time()
    proc = subprocess.Popen(cmd, cwd=work, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    timer = threading.Timer(240, proc.kill)
    timer.start()
    events, calls, cost, timed_out = [], [], 0.0, False
    try:
        for line in proc.stdout:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            events.append(ev)
            if ev.get("type") == "result":
                cost = ev.get("total_cost_usd", 0.0)
            if ev.get("type") == "assistant":
                for b in ev["message"].get("content", []):
                    if b.get("type") == "tool_use" and b["name"] in ("Agent", "Task"):
                        calls.append(b["input"])
            if calls:  # first routing decision seen: stop paying for the rest
                proc.kill()
                break
    finally:
        timer.cancel()
        proc.kill()
        proc.wait()
    if time.time() - t0 >= 239:
        timed_out = True
    tools = [b["name"] for ev in events if ev.get("type") == "assistant" for b in ev["message"].get("content", []) if b.get("type") == "tool_use"]
    if not cost:  # killed before the result event: sum the usage we saw is unavailable; use assistant usage estimate
        cost = estimate_cost(events, model)
    ok, why = grade(spec, calls, tools)
    if timed_out:
        ok, why = False, "timeout"
    if not events or events[0].get("type") != "system":
        ok, why = False, "run did not start"
    res = {"case": case, "run": n, "model": model, "pass": ok, "why": why, "first_call": calls[0] if calls else None,
           "tools": tools, "cost_usd": cost, "seconds": round(time.time() - t0, 1)}
    (out / f"{case}-{n}.json").write_text(json.dumps({**res, "events": events}, indent=1))
    shutil.rmtree(work, ignore_errors=True)
    with print_lock:
        print(f"{'PASS' if ok else 'FAIL'} {case}#{n} {model} {why} ${cost:.2f}", flush=True)
    return res


def estimate_cost(events, model):
    # Rough fallback for killed runs: per-million prices (input, cache write, cache read, output), USD.
    price = {"sonnet": (3, 3.75, 0.3, 15), "opus": (5, 6.25, 0.5, 25)}.get(model, (5, 6.25, 0.5, 25))
    total, seen = 0.0, set()
    for ev in events:
        if ev.get("type") != "assistant":
            continue
        m = ev["message"]
        if m.get("id") in seen:
            continue
        seen.add(m.get("id"))
        u = m.get("usage", {})
        total += (u.get("input_tokens", 0) * price[0] + u.get("cache_creation_input_tokens", 0) * price[1]
                  + u.get("cache_read_input_tokens", 0) * price[2] + u.get("output_tokens", 0) * price[3]) / 1e6
    return total


def short(agent):
    return (agent or "").split(":")[-1]


def grade(spec, calls, tools):
    want = spec["agent"]
    if want == "none":
        return (not calls, "no Agent call" if not calls else f"called {calls[0].get('subagent_type')}")
    if not calls:
        return False, f"no Agent call (tools: {','.join(tools) or 'none'})"
    c = calls[0]
    got, model, effort = short(c.get("subagent_type")), str(c.get("model") or "").lower(), str(c.get("effort") or "").lower()
    desc = f"{c.get('subagent_type')}/{c.get('model')}/{c.get('effort')}"
    if got != want:
        return False, desc
    if "model" in spec and not any(m in model for m in spec["model"]):
        return False, desc
    if any(m in model for m in spec.get("model_not", [])) or ("model_not" in spec and not model):
        return False, desc
    if "effort" in spec and effort not in spec["effort"]:
        return False, desc
    if any(short(x.get("subagent_type")) in spec.get("never", []) for x in calls):
        return False, desc
    return True, desc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("-j", type=int, default=4)
    ap.add_argument("--case", default="*")
    ap.add_argument("--out", required=True)
    ap.add_argument("--budget-usd", type=float, default=0.8)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix="orch-eval-roster-"))
    roster = build_roster(scratch)
    prompt = build_prompt(scratch)
    cases = sorted(p.name for p in (HERE / "cases").iterdir() if fnmatch.fnmatch(p.name, a.case))
    jobs = [(c, n) for c in cases for n in range(1, a.runs + 1)]
    with cf.ThreadPoolExecutor(a.j) as ex:
        results = list(ex.map(lambda j: run_one(j[0], j[1], a.model, roster, prompt, out, a.budget_usd), jobs))
    (out / "summary.json").write_text(json.dumps(results, indent=1))
    print()
    for c in cases:
        rs = [r for r in results if r["case"] == c]
        print(f"{c:28} {sum(r['pass'] for r in rs)}/{len(rs)}  " + "; ".join(r["why"] for r in rs))
    print(f"total ${sum(r['cost_usd'] for r in results):.2f}")
    shutil.rmtree(scratch, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
