# Dependency injection

Use what the project uses (Hilt, Koin, manual). Do not introduce a second framework.

## Hilt wiring

- `@HiltAndroidApp` on the `Application`; `@AndroidEntryPoint` on each Activity, Fragment, Service or receiver that injects; `@HiltViewModel` plus `@Inject constructor` on ViewModels.
- Use `@Binds` (abstract function in an abstract module) to bind an interface to an implementation that has an `@Inject` constructor. Use `@Provides` when you do not own the class (Retrofit, `Room.databaseBuilder`) or construction needs code.
- Scope with the narrowest component that works: `SingletonComponent` for app-wide, `ViewModelComponent` for ViewModel dependencies, `ActivityRetainedComponent` for state outliving rotation. A scope annotation on a class must match the component the binding is installed in.
- Inject dispatchers through a qualifier (`@IoDispatcher`) so tests can replace them.
- For classes Hilt does not create (ContentProvider, some third-party callbacks), define an `@EntryPoint` and fetch it with `EntryPointAccessors`.
- WorkManager workers use `@HiltWorker` with `@AssistedInject` and the `HiltWorkerFactory` configured on the `Application`.

## "cannot be provided without an @Inject constructor or an @Provides-annotated method"

Read the full error: it names the missing type and the chain that needs it. Then:

1. Interface or abstract type with no binding: add `@Binds` or `@Provides` in a module installed in a component that can see the consumer.
2. Concrete class from a library: add `@Provides`.
3. Class you own: add `@Inject constructor`.
4. Binding exists but in the wrong component (a `ViewModelComponent` binding needed in `SingletonComponent`), or the module lacks `@InstallIn`.
5. Missing qualifier on one side, or the same type bound twice with different qualifiers.
6. In a multi-module app, the module defining the binding is not on the app module's classpath, or a test replaced it without a `@TestInstallIn`.

Also: Hilt generated-code failures after a Kotlin or KSP version change are build problems; hand them to `android-build`.

## Koin and manual DI

- Koin: `module { single<Repo> { RepoImpl(get(), get()) } ; viewModelOf(::ListViewModel) }`. Missing definitions fail at runtime, so run `checkModules`/`verify()` in a test where the project does.
- Manual DI: an `AppContainer` created in `Application.onCreate`, handed to ViewModels through a `ViewModelProvider.Factory`. Fine for small apps; keep construction in one place.
