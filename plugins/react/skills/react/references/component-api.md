# Component API shape

Read this when designing a reusable component's props: controlled and uncontrolled state, a polymorphic element, or compound parts. Prefer a headless library the repo already uses over rebuilding these.

## Controlled and uncontrolled

Accept `value` and `onChange` for the controlled form, and `defaultValue` for the uncontrolled form. Decide once, at mount. Switching between them is a bug, and React warns about it.

```tsx
function useControllable<T>({ value, defaultValue, onChange }: {
  value?: T; defaultValue: T; onChange?: (next: T) => void;
}) {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const set = (next: T) => {
    if (!controlled) setInner(next);
    onChange?.(next);
  };
  return [current, set] as const;
}
```

This hook is a local helper, not a React API. If the repo's UI library ships one (for example in Radix or Base UI internals, or the component library itself), use that instead of a copy.

## Polymorphic `as`

An `as` prop lets a component render a different element, such as a button styled as a link. Type it so the other props follow the chosen element (`ComponentPropsWithoutRef<E>`), and keep it to components that really render several elements. A single-purpose component should render one native element.

## Compound components

Give related parts shared state through context when callers arrange the parts themselves (`Tabs`, `Tabs.List`, `Tabs.Panel`). Create the context in the component file, throw a clear error when a part renders outside its parent, and keep the context value stable or split it so unrelated parts do not re-render.
