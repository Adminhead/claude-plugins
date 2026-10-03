# Server boundaries, Actions, and external stores

Read this when the code uses `"use server"`, `"use client"`, `useActionState`, `useOptimistic`, or `useSyncExternalStore`. Check the installed React and framework versions first. Server Components and Server Functions depend on a framework that implements them.

## Server and Client Components

- A Server Component is the default in an RSC framework. It can be `async`, reads server data directly, and ships no JS for itself.
- Add `"use client"` only to the file that needs state, effects, or browser APIs. Keep the boundary as low in the tree as possible.
- Pass serializable props or `children` from server to client. A Client Component cannot import a Server Component, but it can render one passed as `children`.
- Send the client only the fields it renders. Props to a Client Component are visible in the browser, so project a minimal object on the server instead of passing a whole database row.
- Keep module-level mutable state out of server code. One module instance serves many requests.

## Server Functions are public endpoints

React's docs state: "Arguments to Server Functions are fully client-controlled. For security, always treat them as untrusted input, and make sure to validate and escape arguments as appropriate" and "In any Server Function, make sure to validate that the logged-in user is allowed to perform that action" (<https://react.dev/reference/rsc/use-server>).

- Authenticate and authorize inside each action. A page-level check does not cover the action, which can be called directly with a POST.
- Check ownership of the specific resource, not only that a user is logged in.
- Validate the arguments with the repo's schema library.
- Return only what the UI needs, not the raw record.
- Prefer a thin action that calls a server-only data layer that does the auth and query. The Next.js data-security guide describes this pattern (<https://nextjs.org/docs/app/guides/data-security>).

## `cache`

`cache(fn)` memoizes by arguments for one server request. It works in Server Components only, and the cache resets per request. Define the cached function at module level and call it from components. Errors are cached too. Use it to share one query between sibling components. It does not share data across requests.

## Forms and Actions

- `useActionState(action, initialState)` returns `[state, formAction, isPending]`. The action receives `(previousState, formData)`. Pass `formAction` to `<form action>`.
- Validate on the server and return field errors in the state. Keep the submitted values in the state so the form can refill them after a failure.
- `useFormStatus()` reads the pending state of the nearest parent form, so a submit button can disable itself without prop drilling.
- `useOptimistic(value, reducer?)` shows a temporary value while an async action runs and reverts to the real value when it settles. Update it inside a transition or form action, and make the server result the source of truth.
- For multi-step forms or large dynamic field arrays, use the repo's form library (`efficient-js:tanstack` covers TanStack Form).

## `useSyncExternalStore`

Use it for a store outside React, or a browser API with a mutable value such as `navigator.onLine`: `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)`.

- `getSnapshot` must return the same reference when nothing changed. Returning a new object each call causes an infinite re-render loop.
- Supply `getServerSnapshot` when the component renders on the server.
- Use `useState` or `useReducer` when the state can live in React.
