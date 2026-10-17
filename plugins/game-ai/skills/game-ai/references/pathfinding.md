# Pathfinding

Contents: A*, correctness rules, heuristics, graphs, grid versus navmesh, flow fields, smoothing, budgets.

## A*

A* finds the cheapest path on any graph; tiles, rooms and navmesh polygons differ only in `neighbors()` and `cost()`. The frontier is a priority queue ordered by `f = g + h` (`g` = cost so far, `h` = heuristic to the goal). With `h = 0` it is Dijkstra.

```python
import heapq

def a_star(graph, start, goal, h):
    frontier = [(0, 0, start)]          # (f, tie-breaker, node)
    came_from = {start: None}
    g = {start: 0.0}
    tie = 0
    while frontier:
        _, _, cur = heapq.heappop(frontier)
        if cur == goal:
            break                        # test the goal on pop, not on push
        for nxt in graph.neighbors(cur):
            cost = g[cur] + graph.cost(cur, nxt)
            if nxt not in g or cost < g[nxt]:    # relax: keep only improvements
                g[nxt] = cost
                came_from[nxt] = cur
                tie += 1
                heapq.heappush(frontier, (cost + h(nxt, goal), tie, nxt))
    if goal not in came_from:
        return None                      # unreachable
    path, node = [], goal
    while node is not None:
        path.append(node)
        node = came_from[node]
    return path[::-1]
```

Correctness rules:

- Test for the goal when popping. Testing on push returns wrong paths once edge costs vary.
- Relax: a node can be improved when a cheaper route turns up later.
- Push a monotonic tie-breaker so the heap never compares node objects.
- Stale heap entries are fine; skipping a popped node whose `f` is worse than its current `g + h` is an optional speed-up.

## Heuristics

| Moves allowed | Heuristic | Formula (`dx = abs(ax-bx)`, `dy = abs(ay-by)`) |
| --- | --- | --- |
| 4-way grid | Manhattan | `dx + dy` |
| 8-way grid | Octile | `(dx + dy) + (sqrt(2) - 2) * min(dx, dy)` |
| Any angle | Euclidean | `sqrt(dx*dx + dy*dy)` |

Multiply by the cheapest step cost so `h` is in the same units as `g`. If `h` can exceed the true cost, A* is faster but no longer optimal (weighted A*); do that deliberately, not by accident. On an 8-way grid, forbid diagonal moves that cut a blocked corner.

## Picking the graph

- **Tile games:** the grid itself, or a coarser waypoint graph over it. Terrain cost goes in `cost()`.
- **Authored levels:** a hand-placed waypoint graph is cheap and predictable.
- **3D or arbitrary geometry, agent radius and height, off-mesh links (jumps, ladders), crowd avoidance:** the engine's baked navmesh. In Godot that is `NavigationRegion2D/3D` plus `NavigationAgent2D/3D`; the `godot` skill's navigation reference covers baking, layers, avoidance and map sync. Godot also ships `AStarGrid2D` and `AStar2D/3D` for grid and graph cases.
- Use your own A* when the world is a discrete grid or graph, or you need full control of the cost function (danger maps, faction territory).

## Flow fields

For many agents heading to one goal (tower defense, RTS swarms), run one Dijkstra pass outward from the goal, store each cell's cost, and point each cell at its cheapest neighbor. Every agent reads its cell's direction: one search for the whole crowd instead of one per agent. Recompute when the map changes (a tower placed), not per agent.

## Smoothing grid paths

Grid paths zig-zag. String-pull them: from the current point, skip ahead to the farthest waypoint with clear line of sight (and clear width for the agent radius), repeat. Or steer toward a look-ahead point on the path instead of the next cell. Navmesh queries usually return smoothed paths already (funnel algorithm).

## Budgets and dynamic worlds

- Shrink the graph before tuning the search: merge open areas, use hierarchical regions (plan room-to-room, then within the room).
- Cap searches per frame and queue the rest; an agent can keep its old path for a few frames.
- Precompute connected regions (flood-fill labels) so "is the goal reachable" is a lookup, not a failed full search.
- When an obstacle moves, repath only the agents whose remaining path crosses the changed cells.
- Tower-defense mazes: before accepting a placement, check a path from spawn to goal still exists, and reject the placement if not.
