# Click-path bug patterns

Read this when a trace shows a suspect call order or a control that behaves unlike its label. Each entry gives the shape, how to confirm it, and the usual fix. Examples use React and hook-style code, but the shapes apply to any store or framework.

## Sequential undo

```
handler() {
  setA(true)     // sets X = true
  setB(null)     // also resets X = false
}
```

Confirm in the side-effect map: `setB` lists `X` under resets. Fix by moving the reset into the action that owns `X`, reordering the calls only when the order is not load-bearing elsewhere, or making `setB` leave `X` alone.

## Async race

```
handler() {
  fetchA().then(() => set({ loading: false }))
  fetchB().then(() => set({ loading: true }))
}
```

Both promises write `loading`, so the final value depends on arrival order. Confirm by checking that two in-flight calls share a field. Fix by awaiting both and writing once, giving each request its own field, or ignoring stale results with a request id or abort signal.

## Stale closure

```
const [count, setCount] = useState(0)
const onClick = useCallback(() => {
  setCount(count + 1)
  setCount(count + 1)   // both read the captured count
}, [count])
```

Confirm that the callback reads a value from the render that created it and writes it back. Fix with the functional update form (`setCount(c => c + 1)`) or a ref for values read inside long-lived callbacks. Check intervals, event listeners, and debounced handlers first, since they hold closures longest.

## Missing transition

The label says "Save", but the handler only validates. The label says "Delete", but it sets a flag and never calls the API. Confirm by following the handler to the call that persists or sends, and by checking that the endpoint or method exists. Fix by completing the transition, or by changing the label when the narrower behavior is intended.

## Dead path

```
handler() {
  if (isReady) {          // always false at this point
    doTheThing()
  }
}
```

Confirm by tracing where the condition's inputs are set before the handler runs, including defaults and resets. Fix the condition or the ordering that keeps it false.

## Effect interference

A click sets `x = true`. An effect or subscription watches `x` and sets it back, or watches a related field and resets the whole slice. The user sees nothing happen. Confirm by listing every effect, selector subscription, and store middleware that reads or writes the field. Fix by narrowing the effect's dependencies, moving the reset to the event that should cause it, or removing the effect when the state can be derived instead.
