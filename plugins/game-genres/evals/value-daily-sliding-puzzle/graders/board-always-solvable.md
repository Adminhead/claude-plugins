---
type: llm
weight: 3
focus: { source: file, path: puzzle.py }
---

The file generates the daily start board for a 4x4 sliding-tile puzzle (tiles 1 to 15, 0 is the blank, solved layout has the blank bottom-right). Judge whether every board it can return is solvable.

PASS only if all of these hold:

1. The board is solvable by construction or by a correct check. Either it starts from the solved layout and applies only legal blank moves (a random walk or any sequence of slides, with the seed derived from the date), or it builds an arrangement and then verifies or repairs it with a correct solvability rule for a 4-wide board. For a 4-wide board that rule combines the inversion count with the row of the blank; a rule that looks only at the inversion count being even is wrong for this width.
2. The same date always gives the same board (the generator is seeded from the date and uses no global unseeded randomness, wall-clock time or hash() of a string, which varies between processes).
3. The function returns a 4x4 list of lists holding each of 0 to 15 exactly once.

FAIL otherwise. A plain shuffle of the sixteen values with no solvability handling is a FAIL even if the shuffle is seeded. Comments claiming the board is solvable do not count; judge the code. Do not reward length.
