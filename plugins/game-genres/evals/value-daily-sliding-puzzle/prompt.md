---
name: value-daily-sliding-puzzle
description: Value case. A daily 15-puzzle start board generated from a date seed; a random arrangement of the tiles is the trap.
tags: [value]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Write, Skill]
---

I'm adding a daily-puzzle mode to my 15-puzzle (4x4 sliding tiles, tiles 1 to 15 plus a blank, solved when the numbers run in order left to right and top to bottom with the blank in the bottom-right corner). everyone should get the same starting board on a given date, and it should look properly mixed up.

write `puzzle.py` with `daily_board(day: datetime.date) -> list[list[int]]`, using 0 for the blank. standard library only. save it to that file name in the current directory.
