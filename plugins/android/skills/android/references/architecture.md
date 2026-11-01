# Architecture

Layer and module rules adapted from ECC `android-clean-architecture` (MIT, see NOTICE), trimmed to Android. Follow the project's existing shape first.

## Layers

- **UI layer:** screens and ViewModels. Maps domain types to UI state.
- **Data layer:** repositories, local and remote data sources, entities and DTOs, mappers.
- **Domain layer (optional):** use cases and repository interfaces in pure Kotlin. Add it only when logic is shared by several ViewModels or is complex enough to test alone. A use case that only forwards to a repository is noise.

Dependency direction: UI depends on domain (or data when there is no domain layer); data depends on domain; nothing depends on UI. A domain module imports no Android framework classes.

## Modules

A small app is one `:app` module with packages per layer or feature. Split modules when build time, ownership or enforced boundaries justify it. A typical split:

```
app            entry point, DI wiring, Application class
core:*         shared utilities, error types, design system
data:*         repository implementations, database, network
feature:*      screens and ViewModels for one feature
```

Rules: no cycles; `feature` modules do not depend on each other (navigate through an interface or route in a shared module); only `app` knows every module.

## Repositories

- Expose domain types and `Flow` for observable data, `suspend` for one-shot calls.
- Coordinate local and remote sources; the caller never sees which one answered.
- Split fat repositories into focused data sources.
- Map at the boundary with extension functions kept next to the data models (`ItemEntity.toDomain()`, `ItemDto.toEntity()`). Never expose entities or DTOs to the UI layer.

## Errors

Pick one style per project and stay with it: `Result<T>`, or a sealed type such as `sealed interface AppError { Network; Database; Unauthorized }`. Rethrow `CancellationException`; `runCatching` around a suspend call swallows it, so catch the specific exceptions instead. Map errors to UI state in the ViewModel.

## ViewModel state update

```kotlin
viewModelScope.launch {
    repository.load(category)
        .onSuccess { items -> _state.update { it.copy(items = items, isLoading = false) } }
        .onFailure { e -> _state.update { it.copy(error = e.toUiError(), isLoading = false) } }
}
```

## Anti-patterns

- Android framework imports in a domain module.
- Entities or DTOs reaching the UI.
- `GlobalScope` or an unowned coroutine; use `viewModelScope` or an injected scope.
- A ViewModel holding a `Context`, `View` or `Activity`.
- Circular module dependencies.
- Business logic in composables or Activities.
