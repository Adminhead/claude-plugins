---
name: modernize
description: Plan the modernization of a legacy system (a runtime, framework, or dependency upgrade, a migration, or a rewrite) with a time-boxed feasibility spike, a testability milestone, a safety ladder, hazard red-teaming of each phase, and phased exit criteria. Use when asked to "modernize this", "plan the migration", "how do we get off this stack", or to plan a major version upgrade. Not for general implementation plans (efficient:planning), mapping a codebase (authoring:map-codebase), executing the migration (efficient:coding), or recording a single decision (authoring:adr-writing).
---

# Modernize

Produce a phased plan to upgrade, migrate, or rewrite a legacy system. This skill plans and does not execute. Legacy systems are often hard to run at all (end-of-life runtimes, native modules that no longer compile, retired package mirrors), so the plan can't assume the old stack is alive. It measures how alive the system is first, then picks a strategy and a level of regression safety to match.

## Workflow

1. **Get the evidence base.** Use an existing architecture document or README the user points to. Otherwise map the system first, with `authoring:map-codebase` if installed or a direct read of the manifests, entry points, deployment files, and test setup. Collect the stack with versions, the main functional areas, known pain points, and how it runs and deploys. Trust the map, and open a file only to check a specific detail, such as whether a declared dependency is used.

2. **Run a time-boxed feasibility spike.** Set a hard limit (for example half a day) and ask whether the system can run even once, not whether CI can go green. Run the spike in a scratch worktree or container with a frozen-lockfile install (`npm ci`, `uv sync --frozen`, and the like) and discard it afterward, so the user's checkout stays untouched. Per component, record what you observe.
   - Do dependencies install from a committed lockfile without hand-patching?
   - Do native and build steps succeed on a currently supported toolchain?
   - Does it start?
   - Does the test runner execute, and does at least one meaningful test pass?

   Partial results are normal, especially in a monorepo where one service tests green while another can't build. When the box expires, decide with what you have, because resurrecting a system that can't be resurrected is itself a project.

3. **Locate the testability milestone per component.** This is the first phase at which a component runs on a supported runtime, installs from a lockfile without patching, builds on the current toolchain, and passes at least one meaningful test in CI. Name it explicitly for each component. Before that point, don't require an automated test gate on the component, because you would be demanding green tests from something that doesn't run yet. After it, real CI and characterization tests are worth the investment. Label every phase as before or after its component's milestone.

4. **Choose the migration strategy per component.**
   - **Freeze, then lift.** Capture the old behavior as it is, then upgrade under that net. It fits only when the old system almost runs and can be resurrected cheaply.
   - **Beachhead, then expand.** Move the thinnest end-to-end slice onto the modern stack until it builds, boots, and tests, then bring the rest across and write tests on the new stack as you go. Use this by default for a system that doesn't run, with its first phase being to reach the testability milestone with the smallest slice.

5. **Pick the highest reachable rung of the safety ladder** and name the risk that remains. Read `references/safety-ladder.md` for the rungs, the sources of safety other than tests, and how to choose an oracle. Weigh regression cost: an abandoned app with no users doesn't justify an expensive gate, and a production system with users does.

6. **Pick the least disruptive approach per component.** Stop at the first one that solves the problem.
   1. Upgrade in place. Bump the major version and fix the breakage. This is the default, and it is rejected only when no upgrade path is supported, the breakage costs more than a rewrite, or the framework is abandoned.
   2. Swap the dependency for a maintained one with the same shape.
   3. Wrap and strangle. Put a clean interface in front and replace the internals behind it, with old and new running together.
   4. Rewrite. Require an explicit reason for each, because "it's old" is not one.
   5. Remove dead code and features with no use.

   Record each choice and why. Use `authoring:adr-writing` if installed for decisions that need a durable record.

7. **Red-team every phase against the hazard catalog** before it is implemented. Read `references/migration-hazards.md`. For each hazard, decide whether the phase triggers it, run its detection probe against the real repo, and fold the plan action into the phase's tasks and exit criteria. Record the hazards you checked and cleared along with those that fired, since a skipped hazard looks the same as a missed one.

8. **Write the phased plan.** Read `references/plan-template.md` for the phase shape and exit criteria. Each phase is small enough to merge on its own, states its safety rung, and ends with an observable exit criterion.
   - Name the phase that stands up CI. Author the workflow in the first phase after the testability milestone. Making it a required check is a repository-settings change, so list it as an action for the user and don't perform it without their approval.
   - Merge each phase to trunk before starting the next, and cut each phase branch from trunk. Stacked branches leave trunk behind and force later phases to stack too.

## Output

Return the plan in the conversation, and write it to a file only when asked. Include the spike results, the milestone and strategy per component, the target rung, the approach per component, the hazard checks, the phases, and the open decisions that need the user. Keep the plan proportionate to the system. A small service needs a few phases and a short hazard pass.

For the work itself, hand each phase to `efficient:coding` and the tests it needs to `efficient:testing`. For a Postgres major upgrade, `efficient:postgres` covers the database side.
