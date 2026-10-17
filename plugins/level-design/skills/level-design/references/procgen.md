# Procedural generation

Engine-neutral algorithms in pseudocode. For the engine's RNG, noise and tile-painting API in Godot, see the `godot` skill if installed. Weighted loot and drop tables are in `game-design`.

## Contents

1. Seeds and determinism
2. Noise and fBm
3. Rooms and corridors
4. BSP
5. Drunkard's walk
6. Cellular-automata caves
7. Wave function collapse
8. Validation
9. Performance

## 1. Seeds and determinism

- Create one RNG instance per generator, seed it, and pass it to every function that makes a choice. The global random function is order-dependent and breaks reproducibility the moment call order changes.
- **Sub-seeds:** derive a seed per system, such as `hash(world_seed, "layout")` and `hash(world_seed, "loot")`. Adding one extra roll to loot generation then leaves the layout unchanged. Per-chunk seeds (`hash(world_seed, chunk_x, chunk_y)`) let an infinite world generate chunks in any order.
- **Seed from text** (shareable codes, daily challenges) with a stable hash you control, such as FNV-1a over UTF-8 bytes. Some languages randomise their built-in string hash per process, which gives a different world on each launch.
- **Nothing non-deterministic may leak in:** wall-clock time, frame timing, physics results, thread scheduling, or iteration over an unordered hash map or set. Sort keys before iterating where order affects the output.
- The same seed with a different engine version, noise library or float behaviour can give a different world. Keep the generator version in the save, beside the seed, and keep the old generator if old seeds must stay valid.
- Floating-point results can differ across CPUs and compilers. For cross-platform lockstep or competitive daily seeds, generate with integers.

## 2. Noise and fBm

Use a library (FastNoiseLite and similar). Don't implement gradient noise by hand.

```text
fbm(x, y, octaves=5, lacunarity=2.0, gain=0.5):
    total = 0; amp = 1; freq = 1; norm = 0
    repeat octaves:
        total += amp * noise01(x * freq, y * freq)
        norm  += amp
        amp   *= gain
        freq  *= lacunarity
    return total / norm          # back into 0..1
```

- Check the library's output range: some return -1..1 and some 0..1. Rescale before combining.
- Normalise the input coordinates (`x / width`) so a frequency means the same thing at every map size. If the noise looks blocky or like static, the frequency is too high (for tile coordinates, try 0.01 to 0.05).
- **Redistribution:** `pow(e, k)` with `k > 1` creates flat lowlands; ridged noise `1 - abs(2n - 1)` creates mountain spines; `round(e * levels) / levels` creates terraces.
- **Biomes:** sample elevation and moisture with different seeds, then look up a table. The same seed for both gives bands that line up.
- **Island shape:** blend elevation toward a falloff from the centre, for example `d = 1 - (1 - nx²)(1 - ny²)` with `nx` and `ny` in -1..1, then `e = lerp(e, 1 - d, mix)`.
- **Object scatter:** Poisson-disc sampling or a jittered grid, not a threshold on noise, which clumps. Vary the minimum radius by biome for density.
- **Seamless wrap:** sample on a cylinder (map x to an angle and feed cos and sin into 3D noise), or a torus in 4D for both axes.

## 3. Rooms and corridors

1. Try to place random rectangles, rejecting overlaps with a one-tile margin. Cap the attempts.
2. Connect room centres with a minimum spanning tree, then add 10 to 20% of the remaining edges back for loops. A plain chain (each room to the next) produces long dead ends.
3. Carve L-shaped corridors (horizontal then vertical, with the order chosen at random).
4. Assign roles after layout: start = one end of the longest shortest path, boss = the other end, treasure in dead ends.

## 4. BSP

Recursively split the map along its longer axis at a random position, keeping at least `min_size` on each side. Place one room inside each leaf, smaller than the leaf. Connect siblings as the recursion unwinds, so every subtree is connected to its sibling and the whole tree is connected. If rooms overlap or touch, the split position was too close to an edge; enforce the minimum on both sides of every cut. BSP gives structured, building-like layouts.

## 5. Drunkard's walk

A digger starts in the middle and steps randomly, carving floor, until a target share of the map (about 40 to 50%) is open. Clamp it inside the border. It is always connected by construction. Several walkers, or a walker biased to keep its direction, give corridors instead of blobs.

## 6. Cellular-automata caves

```text
fill:   cell = WALL if border or rng.randf() < 0.45 else FLOOR
smooth: repeat 4 to 6 times, into a NEW grid each pass:
            walls = count of WALL in the 3x3 block including the cell
                    (out-of-bounds cells count as WALL)
            cell = WALL if walls >= 5 else FLOOR
```

- Write each pass into a new grid. Updating in place makes the result depend on scan order.
- A fill of 0.40 to 0.50 with 4 to 6 passes gives open caves. All wall or all floor means the fill is too extreme or there were too few passes.
- Caves come out as several disconnected pockets. Flood-fill every region, then keep the largest, tunnel between regions, or reject the map if the largest region is under a target share of the area.
- A follow-up pass that removes wall regions smaller than N tiles gets rid of floating pillars.

## 7. Wave function collapse

WFC is a constraint solver over tiles with adjacency rules.

```text
every cell starts with all tiles possible
loop:
    pick the uncollapsed cell with the fewest options (ties broken by rng;
        weighted entropy if tiles have frequencies)
    if none left: success
    collapse it to one option, chosen by tile weight
    propagate: push the cell on a stack; while the stack isn't empty, pop a cell and,
        for each neighbour, remove options not allowed by any remaining option of the
        popped cell in that direction; if a neighbour shrank, push it
        if any cell reaches ZERO options: contradiction
on contradiction: restart with the next sub-seed (cap the restarts), or backtrack
```

- Detect a contradiction during propagation, the moment any cell reaches zero options. A loop that only looks at cells with more than one option misses empty cells and reports success with holes in the map.
- Rules must be symmetric: if A allows B on its right, B must allow A on its left. Generate the rule table from tile edge labels or a sample image, not by hand.
- Overly restrictive rules cause frequent contradictions; add transition tiles or allow more neighbours before adding backtracking.
- Pre-collapse fixed cells (entrance, exit, a set-piece room) before the loop, then propagate.
- WFC enforces local rules only. It doesn't guarantee connectivity or pacing, so run the validation pass afterwards.
- Cost grows quickly with grid size and tile count. Generate in chunks with fixed borders for large maps.

## 8. Validation

Run on every generated result, then repair or reject it:

- The spawn tile is floor and safe (no enemy or hazard within a radius).
- A path exists from spawn to exit (BFS or A* on the grid).
- Every required room and key is reachable, and no key sits behind the lock it opens (the gated flood fill from the main skill).
- Any size or composition limits hold (minimum room count, minimum open area).
- Cap the retries, and log the seed of every rejected map so failures can be reproduced.

## 9. Performance

- Generating a large map in one frame freezes the game. Spread the work across frames (yield every N rows or cells), or run it on a worker thread that writes into plain data and hands the result to the main thread for rendering.
- Engine scene objects usually can't be created or edited safely from a worker thread. Generate data on the worker, then build the scene on the main thread.
- Batch tile writes rather than updating the renderer cell by cell, and use the engine's terrain or autotile rules instead of hard-coded tile coordinates.
- For streaming worlds, generate chunks around the player ahead of time from per-chunk seeds, and unload far chunks.
