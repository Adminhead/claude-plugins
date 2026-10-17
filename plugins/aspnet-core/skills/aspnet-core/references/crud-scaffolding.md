# Writing CRUD for a model without code generators

Use when asked to "scaffold" Razor Pages, MVC controllers and views, Blazor CRUD components or minimal API endpoints for an EF Core model. Write the files by hand to match the project; don't run `dotnet aspnet-codegenerator` or other scaffolding tools. Normal `dotnet` build, restore and `dotnet ef` commands are fine.

## 1. Parse the request

Pin down: the kind (Razor Pages, MVC with views, Blazor components, minimal API, empty page/view/component), the model and its namespace, the `DbContext` (existing, or a new one with which provider and connection string), names asked for (controller, endpoints class, page), options (OpenAPI, async, layout), and whether required foreign keys pull parent entities into scope.

## 2. Checklist for every EF-backed kind

1. Read the `.csproj`, `Program.cs`, the model, its validation attributes, navigations and foreign keys.
2. Reuse the named `DbContext`; otherwise create the requested one, add only the provider package, and register it with `AddDbContext` and a connection string from configuration. Add `Microsoft.EntityFrameworkCore.Design` with `PrivateAssets="all"` if migrations are needed and it's missing.
3. Generate list, details, create, edit and delete for the model and for every parent it requires through a non-nullable foreign key, so a user can create the parent first.
4. Schema changes go through migrations. Never call `EnsureCreated()` or seed data in `Program.cs`.
5. Prefer `dotnet tool restore` (local tool manifest) for `dotnet ef`; install it only if no manifest exists, and as a local tool.
6. Restore and build; fix every error before reporting.

## 3. UI kinds (Razor Pages, MVC, Blazor)

- Read the layout (`_Layout.cshtml`, `MainLayout.razor`), the main stylesheet or Tailwind config, and one or two existing pages first. Generate markup in the same framework and classes (Bootstrap stays Bootstrap).
- Add navigation links to each new resource.
- Blazor: initialize `[SupplyParameterFromForm]` properties with `= new()` (not `null!`), or `EditForm` throws on the first GET. Add `.AddInteractiveServerComponents()` / `.AddInteractiveServerRenderMode()` only when the new components use `@rendermode InteractiveServer` and the app doesn't already, and never replace existing render-mode calls. Deeper Blazor work belongs to `blazor`.
- Don't add convenience packages such as Razor runtime compilation.

## 4. Minimal API kind

- One route group per resource: `GET /` (list), `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}` for the model and each required parent.
- Every endpoint gets a unique `.WithName()`, `.WithTags()`, a summary or description, success and error response metadata (`TypedResults` with declared `Results<...>`, `.ProducesProblem()`, `.ProducesValidationProblem()`). Don't add `.WithOpenApi()`: it is deprecated on .NET 10 and unnecessary on .NET 9 with `AddOpenApi()`.
- Bodies use request DTOs, not the entity, unless the user explicitly wants the entity bound directly.

## 5. `.http` file (API kinds)

- Name it `{Model}.http` (append a number if it exists).
- One request per endpoint, labelled accurately, URL matching a mapped route.
- Order by dependency: create parents first and capture their IDs (`# @name createX` and `{{createX.response.body.$.id}}`), or comment which IDs to update. No invented FK values.

## 6. Verify

1. `dotnet restore && dotnet build`.
2. With EF: `dotnet ef migrations add <DescriptiveName>` (the name must be unique). Show the migration to the user. Run `dotnet ef database update` only against a local development database, or after the user approves; it changes the database.
3. API kinds: start the app (`dotnet run --launch-profile https` when that profile exists), send every `.http` request in order, and report method, URL and status for each. Fix anything non-2xx that should succeed.
4. Re-check: markup matches the project, no scaffolding tool used, no extra packages, `[SupplyParameterFromForm]` initialized.
