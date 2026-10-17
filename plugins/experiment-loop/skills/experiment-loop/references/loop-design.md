# Designing and reviewing an unattended loop

Read this when a loop will run on a schedule or with nobody watching, or when you are reviewing a loop someone else wrote. The core rule is that execution can be automated but judgment stays with a person. A loop is good at driving a number toward a target. It can't ask whether the target is right.

## Pick the loop type

| Task | Loop type | How it stops |
| --- | --- | --- |
| A clear done test (all checks green, a batch processed) | Goal-seeking | It reaches the goal, or the budget runs out |
| No endpoint, a state to keep healthy | Regulator | It never stops and acts only when the state changes |
| Poll until a condition holds (watch CI turn green) | Regulator with an exit | The exit condition holds |
| Something that must happen on a clock | Either, wrapped in `/schedule` | The scheduler fires it |

Scheduling and polling alone need no design. Use `/loop` or `/schedule` directly.

## Review: five ways a loop fails

Run the loop past each row. One hit means send it back.

| Failure | Question | Fix |
| --- | --- | --- |
| Spins and burns budget | Can a machine judge the exit condition yes or no, or is it "make it good"? | Replace it with a decidable result condition |
| Declares itself done | Is the judge the same agent that made the change, or a "looks fine" check? | A separate, deterministic check, such as CI or a diff against a reference |
| Games the number | Is there a boundary, or only a done-criterion? | Add what it must not do, for example not deleting or weakening tests |
| Runs a wrong answer to the end | Does it rely on asking a question mid-run? | Settle every clarification before it starts |
| Amplifies stale context | Do the docs and notes it reads match the code? | Refresh them first, because the faster it loops, the faster it repeats a stale instruction |

## Roles for a larger loop

Separate three roles when the loop builds something new.

- **Plan** breaks the goal into a spec with acceptance conditions a script can judge.
- **Build** implements to the spec and may not edit the acceptance conditions.
- **Judge** runs the acceptance independently, passes the result or sends the failure back to Build, and escalates to a person after three failed rounds.

## Damping

A loop with no limit oscillates. Keep a retry cap, a hard stop on budget, and a person who flips the last switch, such as merging the branch.

## Never automate these

- Acceptance. A person marks the work done.
- Anything you can't afford to get wrong, such as merging, publishing, or moving money.
- Review of what a self-modifying loop rewrote. The more a loop edits its own rules, the more review it needs, and that review belongs before the change lands.

## Landing it

Run the loop once by hand first, which forces you to state how the judge decides. Then harden it into a skill or subagents. Hang it on a schedule only after those two steps hold up.
