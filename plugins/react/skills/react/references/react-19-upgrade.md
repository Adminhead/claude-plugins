# React 19 upgrade map

Read this when moving a codebase from React 18 to 19, or when a React 19 error mentions a removed API. Run the official codemods first (<https://react.dev/blog/2024/04/25/react-19-upgrade-guide>) and then fix what is left with this map.

## Source changes

| Removed or changed | Replace with |
| --- | --- |
| `ReactDOM.render` | `createRoot(el).render(...)` from `react-dom/client` |
| `ReactDOM.hydrate` | `hydrateRoot(el, ui)` |
| `unmountComponentAtNode` | `root.unmount()` |
| `ReactDOM.findDOMNode` | A DOM ref |
| `propTypes` and `defaultProps` on function components | TypeScript types and default parameters |
| String refs, legacy context (`contextTypes`, `getChildContext`) | Callback refs, `createContext` |
| `forwardRef` | Still works. Function components can take `ref` as a prop, and `forwardRef` is planned for deprecation |
| `useRef()` with no argument (TypeScript) | `useRef(null)` (or pass the initial value you intend) |
| `react-test-renderer/shallow` | Install `react-shallow-renderer` directly, or test through the DOM |

Class components keep `defaultProps`. Leave `prop-types` imports in place if they serve as documentation, and note that React no longer runs the checks.

## Tests

- `act` moves from `react-dom/test-utils` to `react`. Fix this import first, because it blocks the rest.
- `react-dom/test-utils` is removed except for a deprecated `act` re-export. `Simulate` becomes the user-event helper or `fireEvent` from Testing Library, and `renderIntoDocument` becomes `render`.
- StrictMode still double-invokes component bodies and runs an extra setup, cleanup, setup cycle for every effect in development (<https://react.dev/reference/react/StrictMode>). Do not lower an effect-count assertion because of the upgrade. The StrictMode change in 19 is that `useMemo` and `useCallback` reuse the first render's result during the second render, and ref callbacks are double-invoked on mount.
- When a count assertion fails after the upgrade, run the test and read the actual count before changing the expected one. Find out why it changed.

## Scope rule

Change only the removed and renamed APIs during the upgrade. Leave `useTransition`, `useDeferredValue`, `Suspense`, and `lazy` code as it is, because those APIs work the same. Adopt `use`, Actions, `useActionState`, and `useOptimistic` in later, separate changes.
