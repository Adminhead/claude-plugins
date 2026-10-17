# Puzzle

Core loop: read the board, plan a move, make it, the board resolves by its rules (match, push, fall, refill, cascade), see progress toward the objective, repeat until solved or failed. The fun is in planning; the engine must resolve every move deterministically and show it clearly.

Rule families: **match and cascade** (match-3, tile matching), **push** (sokoban, block pushers), **validity check** (nonograms, sliding tiles, flow and circuit puzzles: no cascade, just "solved, unsolved or invalid" after each move).

## Core systems (build in this order)

1. **Board model:** a grid of cells, the single source of truth, with no knowledge of visuals.
2. **Move input** (swap, push, drag, rotate, place), validated before it applies.
3. **Rule resolution** run to stability.
4. **Undo** that restores everything.
5. **Objectives and scoring** (score target, clear all, reach goal; move or time limits).
6. **Levels:** authored, or generated and verified solvable.
7. **Presentation** driven by the list of changes resolution produced.

## Data model

- Board: `cells[y][x]` holding piece ids or empty; `(0,0)` top-left, y grows down.
- Move: a small record (`swap a b`, `push dir`) so it can be logged, replayed and inverted.
- Level: board layout, objective, move or time limit, RNG seed, intended difficulty tag.
- Resolution output: an ordered list of events (`cleared cells`, `fell from to`, `spawned at`, `chain n`) that the view animates.

## Resolution and undo

```text
resolve(board):
    chain = 0
    loop:
        matches = find_matches(board)        # runs of 3+ horizontally and vertically
        if none: break
        chain += 1; score += score_for(matches, chain)
        clear(matches); apply_gravity(board); refill(board, rng)
    return chain

make_move(m): history.push(snapshot(board, score, moves_left, rng_state)); apply(m); resolve(board)
undo():       restore(history.pop())
```

- Loop resolution until stable; one pass misses cascades.
- Gravity compacts each column downward; refill spawns at the top with the seeded RNG.
- Starting board: no pre-existing matches and at least one valid move.
- Optionally reject refill colors that would complete a line, if free cascades aren't wanted.
- **Deadlock (match-3):** after each resolution, try every adjacent swap; if none makes a match, reshuffle the existing pieces (same counts) until a move exists, or end the level.
- **Sokoban push:** blocked if the cell ahead is a wall, or a block with a wall or block beyond it. Win when every target holds a block. Detect dead positions (a block in a non-target corner) to suggest a restart.
- **Undo:** snapshots are simplest and fine for small boards; for large boards store the move plus enough data to invert it. Either way restore board, score, moves left, RNG state and special-piece state. Test by hashing the full state before a move and after undo.

## Solvable generation

- **Generate and verify:** build a candidate, run a solver (BFS or A* over board states for push and slide puzzles; move existence for match-3), keep it only if it solves within the budget.
- **Reverse generation:** start solved and apply random legal inverse moves (pulls for sokoban, slides for sliding puzzles). The result is solvable by construction. A random permutation of a sliding puzzle is unsolvable half the time (parity), so scramble by moves instead.
- Tag each level with its seed and measured difficulty (solution length, branching) so the progression curve can be tuned and a bad level reproduced.

## Feel targets

- Input locks while the board resolves; the view plays the event list, not a half-updated board.
- Swaps that don't match animate and snap back (match-3) rather than being silently refused.
- Each chain step is louder: rising pitch, bigger pop, a counter. Chains are the reward.
- Thinky puzzles (sokoban, logic) favor instant moves, unlimited undo and a restart key over animation.
- Show the current constraints clearly (remaining moves, targets left, rule hints for logic grids).

## Balancing norms

| Knob | Norm |
| --- | --- |
| Cascade scoring | `base * chain` (linear) or `base * 2^(chain-1)` (exponential); bigger single matches (4, 5) create special pieces |
| Move limit vs timer | move limits make it puzzly, timers make it arcade |
| Difficulty curve | one new mechanic per level or world, practiced alone before combining |
| Undo | unlimited for logic and push puzzles; limited or none for score-chasing match-3 |
| Board size | standard 8x8 for match-3; push puzzles get harder with more boxes, not more space |
| Hints | after a period of inactivity, highlight a valid move (match-3) or offer a step (logic) |

## Pitfalls

- Logic mixed into visuals: animation desyncs from state.
- Resolving once: cascades missed.
- Undo that misses score, move count or RNG state.
- Unseeded refill: levels and daily puzzles can't be reproduced.
- Generated boards that aren't solvable: unfair dead ends.
- No deadlock check: a match-3 board with no moves soft-locks.
- Accepting input mid-cascade: double moves and corrupted state.
- Too many mechanics at once.

## Engine pointers

- Grid rendering, tweens for swaps and falls, HUD: `godot` (2D, UI and animation references).
- Pop, shake and chain feedback: `game-feel`; level pacing: `level-design`.
- Progress and best scores in saves: `game-architecture`.
