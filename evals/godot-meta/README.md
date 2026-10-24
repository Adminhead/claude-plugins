# godot-meta paired routing evals

Routing checks with the whole Godot set loaded at once: the `godot-meta` plugins, the `gamedev-core` bundle and `programming-core`. Per-plugin evals load one plugin, so they can't tell whether the right skill wins when two overlap (`game-feel` against `godot-physics`, `game-ui` against `godot`, `godot-testing` against `unit-testing`). Each case's `plugins:` list loads the set; the graders check that the expected skill fires and, where the boundary is sharp, that its neighbour stays quiet.

```
claude plugin eval . --eval-dir evals/godot-meta/evals --trust-plugin --ablation none -j 4 --no-publish
```

Run it from the repo root: a case's `plugins:` entries must sit under the directory `claude plugin eval` targets. `--ablation none`: a no-plugin baseline means nothing for routing. Keep the `plugins:` lists in step with `godot-meta`, `gamedev-core` and `programming-core`.

Closure rule: each case's `plugins:` list must equal the `godot-meta` closure minus the listed exclusions (`grep-app`, per D8). `python3 scripts/plugins.py check` enforces it and reports any drift.
