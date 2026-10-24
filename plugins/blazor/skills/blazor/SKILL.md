---
name: blazor
description: 'Builds and debugs Blazor components and Blazor Web Apps: parameters and EventCallback, render modes, forms and validation, auth by render mode, shared state, data loading, prerendering, JS interop, and Blazor Server to Web App conversion. Use for any .razor file, a new Blazor project, data loading twice, or HttpContext null in a component.'
---

# Blazor

For `.razor`/`.razor.cs` files and Blazor Web App projects (`AddRazorComponents`, `blazor.web.js`).

Not for: Razor Pages or MVC views (`aspnet-core`), the API endpoints a WebAssembly client calls (`aspnet-core`), EF Core query work (`ef-core`), general C# (`csharp`), component tests' runner syntax (`dotnet-testing`).

## Orient: find the render mode first

Every rule below depends on where a component runs. Before editing, determine:

- **Mode**: `Program.cs` registrations (`AddInteractiveServerComponents`, `AddInteractiveWebAssemblyComponents`, both = Auto, neither = static SSR only).
- **Scope**: `App.razor`. `<Routes @rendermode="..."/>` means global interactivity; a bare `<Routes />` means per-page, where only components with `@rendermode` are interactive.
- **Projects**: a `.Client` project means WebAssembly or Auto; interactive WebAssembly/Auto components must live there.
- **Target framework**: several APIs below need .NET 9 (`RendererInfo`, `[ExcludeFromInteractiveRouting]`, `AddAuthenticationStateSerialization`) or .NET 10 (`[PersistentState]`). Don't use them on older TFMs.

If the repo's CLAUDE.md or AGENTS.md records the render mode, trust it but confirm against `App.razor`.

| Mode | Runs where | Data access | Gotchas |
|---|---|---|---|
| Static SSR | Server, per request, no circuit | Inject services directly | No `@onclick`/`@bind`; forms post via `[SupplyParameterFromForm]` + `FormName`; `[StreamRendering]` for slow loads |
| Interactive Server | Server, SignalR circuit per user | Inject services; `IDbContextFactory<T>` for EF | Scoped = per circuit; never per-user state in singletons; prerender runs `OnInitializedAsync` twice |
| Interactive WebAssembly | Browser | `HttpClient` to APIs only | Code must be in `.Client`; no server-only types; runtime download on first visit |
| Interactive Auto | Server first, then browser | Through an abstraction with server and client implementations | Register services in both `Program.cs` files; test both paths |

## Component rules

- Data flows down via `[Parameter]`; events flow up via `EventCallback`/`EventCallback<T>`, never `Action`/`Func`.
- Declare parameters as `[Parameter] public T Prop { get; set; }` auto-properties. Don't use `required` or `init`: the renderer sets parameters, not object initializers. Mark must-pass parameters `[EditorRequired]`.
- Never assign to a `[Parameter]` from inside the component; copy it to a private field in `OnParametersSet`.
- Collection parameters as `IReadOnlyList<T>`; `@key` on elements and components rendered in loops.
- Render every state explicitly: loading, empty, loaded, error.
- `RenderFragment? ChildContent` for slots, `RenderFragment<TItem>` with `@typeparam TItem` for templates.
- Keep a single `.razor` with `@code` for small components; move to `.razor` + `.razor.cs` (`partial class`) when the logic grows past about 50 lines.
- Style with CSS isolation (`Component.razor.css`) and classes, not inline `style`.
- Split a page with several independent regions into child components before it passes about 200 lines ([references/components.md](references/components.md)).

## Async rules

Components run on a single-threaded synchronization context per circuit or tab.

- `await` every task. No `.Result`, `.Wait()`, `Task.Run`, `ContinueWith`, `new Thread`, or concurrent collections in components.
- Framework events re-render automatically; call `StateHasChanged()` only for intermediate updates between awaits, or after work the framework doesn't know about.
- From timers, C# events, SignalR or `[JSInvokable]` callbacks: `await InvokeAsync(() => { ...; StateHasChanged(); })`. Use an `async void` handler with `try/catch` that calls `DispatchExceptionAsync(ex)`; never `_ = InvokeAsync(...)`.
- Debounce and polling: `CancellationTokenSource` + `await Task.Delay(interval, token)`, not `System.Threading.Timer`.
- Own a CTS, subscription, timer or JS reference → implement `IAsyncDisposable`: unsubscribe, cancel, dispose; never call `StateHasChanged` there; null-check fields because disposal can run before initialization finishes.

## Lifecycle traps

- With prerendering (the default for interactive modes) `OnInitializedAsync` runs twice: once static, once interactive. Persist state with `[PersistentState]` on a **public** property plus `Prop ??= await Load()` (.NET 10), or `PersistentComponentState` on older versions ([references/prerendering.md](references/prerendering.md)).
- JS interop only in `OnAfterRenderAsync(firstRender)` or event handlers; JS doesn't exist during prerender ([references/js-interop.md](references/js-interop.md)).
- `HttpContext` is only valid during static SSR. Interactive components read the user from `[CascadingParameter] Task<AuthenticationState>` ([references/auth.md](references/auth.md)).
- `<CascadingValue>` doesn't cross render-mode boundaries; use `AddCascadingValue`/`CascadingValueSource<T>` in DI ([references/state.md](references/state.md)).

## Verify

- `dotnet build` with zero new warnings (BL and RZ diagnostics included).
- Run the app (`dotnet run` in the server project) and exercise the change in the mode it renders in; for Auto, check both a first visit (Server) and a reload after the runtime is cached (WebAssembly).
- Component tests: follow the repo's setup (bUnit is common) via `dotnet-testing`.

## References

Read the one that matches the task:

- [references/create-project.md](references/create-project.md): choosing a render mode, `dotnet new blazor` flags, what the template generates, Program.cs and App.razor wiring.
- [references/components.md](references/components.md): decomposing a page, async patterns in depth, disposal patterns.
- [references/forms.md](references/forms.md): `EditForm`, input components, validation, SSR form posts, file upload, double-submit.
- [references/auth.md](references/auth.md): auth services, `AuthorizeRouteView`, `[Authorize]`, Identity pages, WebAssembly auth state.
- [references/state.md](references/state.md): cascading values, `CascadingValueSource<T>`, scoped state services, lifetimes per mode.
- [references/data.md](references/data.md): loading and sending data, `HttpClient` registration, errors, reloading on parameter change, Auto/WebAssembly service abstraction.
- [references/prerendering.md](references/prerendering.md): persisting state, disabling prerendering, `[ExcludeFromInteractiveRouting]`, `RendererInfo`.
- [references/js-interop.md](references/js-interop.md): collocated modules, typed wrappers, `DotNetObjectReference`, disposal and circuit loss.
- [references/server-to-webapp.md](references/server-to-webapp.md): converting a .NET 6/7 Blazor Server app (`_Host.cshtml`, `MapBlazorHub`) to a Blazor Web App.

Adapted from dotnet/skills `plugins/dotnet-blazor` and `convert-blazor-server-to-webapp` (MIT, .NET Foundation and Contributors). See NOTICE.
