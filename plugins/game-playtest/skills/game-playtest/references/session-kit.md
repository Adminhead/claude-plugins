# Playtest session kit

Templates to copy for one playtest round. Fill the plan before recruiting; fill the rest during and after.

## Contents

1. Test plan
2. Screener
3. Consent checklist
4. Facilitator script
5. Observer sheet
6. Debrief questions
7. Survey design
8. Severity scale
9. Synthesis and triage
10. Readout template
11. Sources

## 1. Test plan

```markdown
# Playtest <round> - <build id> - <date>

**Research questions** (1 to 3)
| # | Question | Decision it feeds | Evidence | Threshold |
|---|---|---|---|---|
| 1 | Do new players find the dash unprompted? | Add a forced tutorial beat? | Observed first dash use (timestamp) | Fewer than half by minute 5 -> add the beat |

**Test type:** first-time-user / focused / RITE / take-home / A/B / accessibility
**Players:** <count>, <profile>, recruited via <channel>, incentive <x>
**Session:** <length>, <in person or remote>, <moderated or not>, recording <screen, face, input, audio>
**Tasks** (phrased as goals, not instructions): <list>
**Telemetry:** events needed for each question (see telemetry.md)
**Keep, change or kill criteria:** <from the SKILL.md list, with numbers>
**Roles:** facilitator <name>, observers <names>, note-taker <name>
```

## 2. Screener

Ask only what selects the right players, and avoid revealing the game so applicants can't tailor answers.

- Platforms they play on and hours per week.
- Three games played recently, and their favourite genres (check against the target audience).
- Experience with the comparable games named in the pitch.
- Age band (and guardian contact for minors).
- Accessibility needs or assistive tech used, as optional and welcomed.
- Whether they work in games or have seen this game before (exclude both for first-time-user tests).
- Availability and equipment for remote sessions.

## 3. Consent checklist

- [ ] What is recorded (screen, face, voice, inputs, telemetry) and why.
- [ ] Who sees the recordings, where they are stored, and when they are deleted.
- [ ] The player can stop at any time and still receive the incentive.
- [ ] Confidentiality terms for unreleased content, in plain language.
- [ ] Guardian consent for minors, with the guardian present or reachable.
- [ ] Separate opt-in for using clips outside the team (for example in a talk).

## 4. Facilitator script

```text
Intro (2 min)
  "Thanks for coming. We're testing the game, not you. Nothing you do is wrong.
   I didn't make this, so you won't hurt my feelings." (Say it even if you did.)
  "I'll mostly stay quiet and may not answer questions, because we want to see
   what happens when you're on your own. Ask anyway; it helps us."
  Think-aloud only if chosen: "Please say what you're thinking as you play: what
   you're looking at, what you're trying to do, what surprises you."

Play (bulk of the session)
  Give each task as a goal: "Try to reach the lighthouse." Not "Press Shift to dash."
  Neutral prompts only: "What are you thinking?", "What do you expect that to do?",
  "What would you try next?"
  Stuck rule: after <N> minutes stuck, give the smallest hint, and log the time.

Debrief (10 min): section 6, then the survey.
Close: thank, incentive, remind about confidentiality.
```

## 5. Observer sheet

One row per observation. Code each row so synthesis is fast.

| Time | Player | Where (level, area) | What happened (behaviour, not interpretation) | Quote | Code | Severity |
|---|---|---|---|---|---|---|
| 04:12 | P3 | Tutorial cave | Walked past the dash prompt, tried jumping the gap 4 times | "Is this even possible?" | C | 3 |

Codes: **C** confusion, **F** frustration, **D** delight, **B** bug, **X** exploit or unintended strategy, **Q** quit or wanted to stop, **H** facilitator helped.

Watch for: hesitation before input, repeated failed attempts, ignoring a tutorial prompt, backtracking, menu wandering, leaning in or sitting back, laughing, sighing, checking the time.

## 6. Debrief questions

Open first, specific next, rating last.

1. "Describe the game to a friend who hasn't seen it." (Comprehension of goal and core verb.)
2. "What do you remember most?" "What was the most frustrating moment?"
3. "At <timestamp> you <behaviour>. What was going on there?"
4. "What were you trying to do when you stopped?" "What did you expect to happen next?"
5. "If you could change one thing, what would it be?" (Treat the answer as a symptom.)
6. "Would you keep playing if you could? Why or why not?"

## 7. Survey design

- Keep it under about 5 minutes. Put questions tied to the research questions first.
- Use specific, single-concept items ("I knew what to do next in the forest level") on a consistent 5- or 7-point agreement scale; avoid double-barrelled items ("The controls were responsive and intuitive").
- Add one or two open questions ("What, if anything, confused you?").
- For a standard player-experience measure, the Player Experience Inventory (PXI; Vanden Abeele et al., 2020) is validated across several studies. Use the Game Experience Questionnaire (GEQ) with care: a systematic review (Law, Brühlmann and Mekler, CHI PLAY 2018) found its factor structure poorly supported, so don't report its subscale scores as settled.
- Compare scores across rounds of the same game, not against other games.
- With fewer than about 20 respondents, report the distribution (counts per answer), not a mean.

## 8. Severity scale

| Level | Meaning | Example |
|---|---|---|
| 4 Blocker | Player can't progress or quits | Nobody finds the exit from the first room |
| 3 Major | Big delay, frustration, or misses a core mechanic | Dash undiscovered until the facilitator hints |
| 2 Minor | Short confusion, recovers alone | Misreads an icon, then corrects |
| 1 Cosmetic | Noticed, no effect on play | Typo, slight overlap |

## 9. Synthesis and triage

1. Merge observer sheets into one list per issue (the same root cause across players becomes one issue with a count).
2. For each issue record: description, players affected (count of total), worst severity, evidence (timestamps, clip links, metric), research question it relates to.
3. Score: `priority = players_affected x severity`. Ties break toward issues on the core loop and the first 10 minutes.
4. Propose a fix per issue and an expected effect you can check next round. Note issues you'll deliberately leave alone and why.
5. In RITE, fix only issues with a clear cause and a cheap fix right after the session; log what changed between sessions.

| # | Issue | Players | Severity | Priority | Evidence | Question | Proposed fix | Check next round |
|---|---|---|---|---|---|---|---|---|

## 10. Readout template

```markdown
# Playtest <round> readout - <build id>

**Answers to the research questions** (one line each, with the evidence and whether the threshold was met)
**Keep, change or kill:** <verdict against the pre-set criteria>
**Top issues** (top 5 from the triage table)
**What worked** (keep these; protect them from later changes)
**Surprises and open questions** (inputs to the next plan)
**Next round:** <questions, build changes, players>
```

## 11. Sources

- Mike Ambinder, "Valve's Approach to Playtesting: The Application of Empiricism", GDC 2009 (designs as hypotheses, playtests as experiments).
- Michael C. Medlock, Dennis Wixon, Mark Terrano, Ramon L. Romero and Bill Fulton, "Using the RITE method to improve products: a definition and a case study", Usability Professionals Association, 2002.
- Anders Drachen, Pejman Mirza-Babaei and Lennart Nacke (eds.), *Games User Research*, Oxford University Press, 2018.
- Steve Bromley, *How To Be A Games User Researcher*, 2021.
- Tracy Fullerton, *Game Design Workshop*, 4th ed., CRC Press, 2018, playtesting chapter.
- Jakob Nielsen, "Why You Only Need to Test with 5 Users", Nielsen Norman Group, 2000.
- Vero Vanden Abeele, Katta Spiel, Lennart Nacke, Daniel Johnson and Kathrin Gerling, "Development and validation of the player experience inventory", International Journal of Human-Computer Studies 135, 2020.
- Effie L.-C. Law, Florian Brühlmann and Elisa D. Mekler, "Systematic Review and Validation of the Game Experience Questionnaire (GEQ)", CHI PLAY 2018.
