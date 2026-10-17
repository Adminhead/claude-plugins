---
name: game-playtest
description: Plans, runs and analyses game playtests, covering research questions, recruiting, session scripts, observer notes, think-aloud, first-time-user tests, surveys, lightweight telemetry, ranked fixes and keep-or-kill criteria. Use for "playtest", "feedback from testers", "is it fun", "where do players quit" or "what should we fix first".
---

# Game playtest

A playtest is an experiment: the design is a hypothesis, and the session collects evidence for or against it. This skill turns "let's get some people to play it" into a plan, a run sheet, data and a ranked change list.

Not for: automated tests and code QA (`godot-testing` or the engine's test skill, `unit-testing`), bug triage of crash reports (`gh-triage`), or deciding the design itself (`game-design`). Use each one if installed.

## Workflow

1. **Write the questions first.** One to three research questions, each tied to a decision the team will make ("Do new players find the dash without the tutorial prompt? If under half do, we add a forced tutorial beat."). For each, name the evidence that answers it: observed behaviour, a metric, or a survey answer. Done when every question has a decision and a threshold.
2. **Pick the test type** that fits the questions:

   | Question | Test type |
   |---|---|
   | Can new players learn it unaided? | First-time-user test, moderated, one player at a time |
   | Does this one mechanic feel right? | Focused test on a slice or gym level |
   | Fix fast between sessions | RITE (Rapid Iterative Testing and Evaluation): fix clear issues after each session, retest the next |
   | Is it fun over hours? Where do players drop off? | Longer or take-home sessions with telemetry and a diary or survey |
   | Which of two versions works better? | A/B with enough players per arm and one pre-chosen metric |
   | Is it accessible? | Sessions including players with disabilities (see `game-ui`'s accessibility reference) |

3. **Recruit the target players.** Match the audience (genre experience, platform, age), not teammates or friends who know the game. Five to eight players per round find most of the big usability problems; surveys and metrics need far more. Screen with a short questionnaire, get informed consent covering recording and data use, get guardian consent for minors, and offer an incentive. Use the screener and consent checklist in [references/session-kit.md](references/session-kit.md).
4. **Prepare the build and the kit.** A stable build with a known build id, telemetry on, debug overlays off, saves reset. A facilitator script with tasks phrased as goals, an observer sheet, the survey, and recording set up. Run a pilot session with a colleague and fix the kit. See [references/session-kit.md](references/session-kit.md).
5. **Run the session without helping.** Brief the player that the game is being tested, not them. Then stay quiet. Answer questions with questions ("What would you try?"). Note timestamped behaviour, quotes and emotional reactions on the observer sheet. Step in only when the player is stuck past the agreed time limit, and record that you did.
6. **Debrief and survey straight after.** Open questions first (what they remember, what confused them, what they wanted to do next), then the survey. Ask about specific moments you saw rather than "did you like it?".
7. **Synthesise the same day.** Turn notes into one issue per row: what happened, how many players, severity, and evidence (timestamps, clips, metrics). Keep observed behaviour separate from opinions. Treat player suggestions as symptoms of a problem, not as the fix.
8. **Rank and decide.** Score each issue (players affected x severity), map it to the research question, and pick fixes. Check keep-or-kill criteria set in step 1, not new ones invented after seeing the data.
9. **Retest the fixes** in the next round with fresh players, and report what changed.

## Keep, change or kill

Agree on these before the test, write them in the plan, and read them out in the readout:

- **Comprehension:** most players state the goal and core verb in their own words by the end of the session.
- **Engagement:** players keep playing when told they may stop, ask to play again, or use the core verb when it is optional.
- **Difficulty:** deaths and retries per checkpoint sit inside the target band from `game-design`, and nobody quits in frustration at the same spot.
- **Fit to pillars:** what players praise and remember matches the pillars; if they love something off-pillar, discuss it explicitly.
- **Kill signal:** the core loop fails the comprehension or engagement bar for two rounds after fixes. Change the loop, not the polish.

## Gotchas

- **"Is it fun?" gets polite yeses.** Measure behaviour (voluntary play time, replays, optional use) and ask about specific moments.
- **Leading questions** ("Was the jump too floaty?") plant the answer. Ask "Tell me about the jumping."
- **Helping the player** destroys the result for that section. Agree a stuck-time limit and log every intervention.
- **Testing with the team or friends** finds almost nothing a real player would struggle with; they already know the game.
- **Concurrent think-aloud changes how people play**, especially in fast action. For action games, use retrospective think-aloud over the recording, or prompt only at natural pauses.
- **Small-sample percentages.** "60% liked it" from five players is three people. Report counts, and use small rounds to find problems, not to measure their frequency.
- **Telemetry without questions** produces dashboards nobody reads. Instrument for the research questions; see [references/telemetry.md](references/telemetry.md).
- **Changing several things between rounds** makes it impossible to tell which change worked, except in RITE, where you fix only clear issues and keep notes.
- **Player data is personal data.** Anonymise ids, collect only what the questions need, get consent, and check privacy rules (for example GDPR, and children's privacy laws for young players) before shipping telemetry outside the studio.

## References

- [references/session-kit.md](references/session-kit.md): read when preparing or running a session: test plan template, screener, consent checklist, facilitator script, observer sheet, debrief questions, survey design, severity scale, synthesis and triage table.
- [references/telemetry.md](references/telemetry.md): read when adding playtest metrics or analysing them: question-first event design, event schema, core events, funnels and heatmaps, key metrics, a minimal logger, and analysis pitfalls.

## Sources

Built from published games user research, cited rather than copied: Mike Ambinder, "Valve's Approach to Playtesting: The Application of Empiricism" (GDC 2009); Medlock et al., "Using the RITE method to improve products" (UPA 2002); Drachen, Mirza-Babaei and Nacke (eds.), *Games User Research* (Oxford University Press, 2018); Steve Bromley, *How To Be A Games User Researcher* (2021); Fullerton, *Game Design Workshop*, playtesting chapter. Full list in the references.
