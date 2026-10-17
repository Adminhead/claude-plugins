# Playtest telemetry

Lightweight metrics for playtests and betas. Telemetry tells you what players did and where; observation and interviews tell you why. Use both, and tie each event to a research question.

## Contents

1. Question-first event design
2. Event schema
3. Core events
4. Key metrics
5. Funnels and heatmaps
6. Minimal logger
7. Analysis
8. Privacy
9. Pitfalls
10. Sources

## 1. Question-first event design

For each research question, write the metric that answers it, then the events that metric needs. Don't log an event that no question uses.

| Question | Metric | Events needed |
|---|---|---|
| Where do new players quit? | Last checkpoint reached per session | `session_end`, `checkpoint_reached` |
| Is level 3 too hard? | Deaths and retries per checkpoint, time to complete | `death`, `level_start`, `level_complete` |
| Is the shop used? | Purchases per player per hour, items never bought | `purchase`, `currency_changed` |

## 2. Event schema

One flat record per event, appended as a JSON line.

| Field | Example | Notes |
|---|---|---|
| `event` | `death` | snake_case, past-tense or noun; a fixed list in code |
| `ts` | `2026-10-17T14:03:22.512Z` | UTC, ISO 8601, with milliseconds |
| `t_session` | `742.5` | seconds since session start (survives clock changes) |
| `session_id` | random UUID per session | |
| `player_id` | random UUID per install | never an email, name or platform account id |
| `build_id` | `0.4.2+a1b2c3d` | version plus commit; required to compare rounds |
| `level`, `checkpoint` | `forest_2`, `cp3` | |
| `pos` | `[12.5, 0, -40.2]` | world position for heatmaps |
| `data` | `{"cause": "spikes"}` | event-specific fields, documented per event |

## 3. Core events

- `session_start` (platform, input device, settings summary), `session_end` (reason: quit, crash, completed, timeout).
- `level_start`, `level_complete` (time), `level_fail` (cause), `checkpoint_reached`.
- `death` (cause, killer type, position), `retry`.
- `tutorial_step` (step id, shown or completed, time since shown).
- `ability_used` for the mechanics under test (first use matters most).
- `item_acquired`, `purchase`, `currency_changed` (source or sink, amount, balance after).
- `menu_opened`, `settings_changed` (which option; accessibility options are worth tracking).
- `error` (non-fatal), plus the engine's crash reporter for fatal ones.

## 4. Key metrics

- **Completion rate** per level and checkpoint, and the drop between consecutive checkpoints.
- **Attempts and deaths per checkpoint**, with the cause mix.
- **Time per level** (median and p90), and time to first use of each core mechanic.
- **Quit points:** where `session_end` with reason quit clusters.
- **Session length** and sessions per player for take-home tests.
- **Retention** for betas: share of players returning on day 1 and day 7.
- **Economy:** currency held over play time, purchase rate, items never bought (see `game-design`'s economy reference).

## 5. Funnels and heatmaps

- **Funnel:** count players reaching each step of an ordered sequence (start tutorial, first dash, first kill, leave cave, reach checkpoint 1). The largest drop is the first thing to watch on recordings.
- **Heatmap:** bin `pos` of deaths, quits or stuck time onto the level map (2D grid cells or a top-down projection for 3D). Overlay on a level screenshot.
- **Stuck detection:** flag stretches where the player stays within a small radius for more than about 60 s without progress events.

## 6. Minimal logger

Engine-neutral pseudocode. The engine skill supplies file paths and JSON helpers.

```text
on game start:
    session_id = uuid4(); player_id = load_or_create_install_id()
    file = open_append(user_data_dir / "telemetry" / f"{session_id}.jsonl")

log(event, data = {}):
    if not telemetry_consent: return
    record = { event, ts: utc_now_iso(), t_session: clock_since_start(),
               session_id, player_id, build_id: BUILD_ID,
               level: current_level(), pos: player_pos_rounded(), data }
    file.write(to_json(record) + "\n")       # buffered; flush on level change and quit

on quit or crash handler: log("session_end", {reason}); file.flush()
```

- Write locally first; upload only with consent, in batches, and never block gameplay on the network.
- For in-person tests, collect the files from the test machines after each session.
- Keep the event list and field definitions in one data file the logger validates against.

## 7. Analysis

JSON lines load directly into DuckDB, pandas or a spreadsheet. Example with DuckDB SQL:

```sql
-- deaths per checkpoint in one build
SELECT checkpoint, count(*) AS deaths, count(DISTINCT player_id) AS players
FROM read_json_auto('telemetry/*.jsonl')
WHERE event = 'death' AND build_id = '0.4.2+a1b2c3d'
GROUP BY checkpoint ORDER BY checkpoint;
```

Always filter by `build_id`, report player counts beside event counts, and look at medians and p90 rather than means.

## 8. Privacy

- Collect the minimum the questions need. No names, emails, platform account ids, IP addresses or free-text chat in telemetry.
- Use random install and session ids. Tell players what is collected, get consent where the law or platform requires it, and offer an off switch.
- Set a retention period and delete raw files after it.
- Check applicable rules (for example the GDPR in the EU and UK, and children's privacy laws if young players are in the audience) and each platform's data policy before collecting telemetry from public builds.

## 9. Pitfalls

- **No build id** makes rounds incomparable.
- **Local timestamps** break ordering across time zones and clock changes; use UTC plus session time.
- **Double-logged events** (a death logged by both player and enemy code) inflate counts. Log each event from one owner.
- **Survivorship:** players who quit early don't appear in late-level metrics. Read every metric beside the funnel.
- **Metrics without context:** a high death count may mean a satisfying challenge or a broken jump. Watch the recording before changing anything.
- **Telemetry on a debug build** with cheats or skips enabled pollutes the data; tag or exclude dev sessions.

## 10. Sources

- Jun H. Kim, Daniel V. Gunn, Eric Schuh, Bruce C. Phillips, Randy J. Pagulayan and Dennis Wixon, "Tracking Real-Time User Experience (TRUE): A comprehensive instrumentation solution for complex systems", CHI 2008 (pairing behavioural telemetry with attitudinal data and video).
- Magy Seif El-Nasr, Anders Drachen and Alessandro Canossa (eds.), *Game Analytics: Maximizing the Value of Player Data*, Springer, 2013.
- Anders Drachen, Pejman Mirza-Babaei and Lennart Nacke (eds.), *Games User Research*, Oxford University Press, 2018.
