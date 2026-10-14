---
type: llm
---
Rule from the skill: "Record a baseline with React DevTools Profiler, browser performance tools, or the build report" and "Add `memo`/`useMemo`/`useCallback`, deferral, code splitting, or virtualization only when measurement shows a gain... If the symptom won't reproduce, make no optimization claim." The user supplied no profile, row count, or timings.

PASS only if ALL of these:
1. The answer asks for, or tells the user to take, a measurement first (React Profiler, performance trace, or the product count and timings) before any optimization.
2. It does not add `memo`, `useMemo`, `useCallback`, `useDeferredValue` or other deferral, code splitting, or virtualization to the code, or recommend them as the fix to apply now, without a measurement. It may name them as candidates after a profile shows the cost.
3. It does not claim the code is now faster.
FAIL otherwise. Do not reward length.
