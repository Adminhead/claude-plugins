# Hilt in tests

Verified 2026-11-01: Hilt 2.60.1 is the latest release. Use the project's version; the setup below is stable across 2.4x and later.

## Instrumented tests

```kotlin
// app/build.gradle.kts
dependencies {
    androidTestImplementation("com.google.dagger:hilt-android-testing:<hilt version>")
    kspAndroidTest("com.google.dagger:hilt-android-compiler:<hilt version>")   // kaptAndroidTest if the project uses kapt
}
android.defaultConfig.testInstrumentationRunner = "com.example.HiltTestRunner"
```

```kotlin
class HiltTestRunner : AndroidJUnitRunner() {
    override fun newApplication(cl: ClassLoader?, name: String?, context: Context?): Application =
        super.newApplication(cl, HiltTestApplication::class.java.name, context)
}
```

```kotlin
@HiltAndroidTest
class ProfileTest {
    @get:Rule(order = 0) val hiltRule = HiltAndroidRule(this)
    @get:Rule(order = 1) val composeRule = createAndroidComposeRule<HiltTestActivity>()

    @Inject lateinit var repo: ProfileRepository

    @Before fun setUp() { hiltRule.inject() }
}
```

- `HiltAndroidRule` must run first (`order = 0`), before any rule that launches an activity.
- The runner replaces `Application` with `HiltTestApplication`; without it the app's real graph builds and tests fail with missing-binding or duplicate-component errors.
- A Compose test that needs `hiltViewModel()` needs an `@AndroidEntryPoint` `ComponentActivity` in the debug source set (conventionally `HiltTestActivity`), declared in `src/debug/AndroidManifest.xml`. The stock `createComposeRule()` activity is not a Hilt entry point.
- Each test gets a fresh component, so injected singletons do not leak between tests.

## Replacing bindings

- Replace one module for all tests: `@TestInstallIn(components = [SingletonComponent::class], replaces = [NetworkModule::class])` on a test module.
- Replace for one test class: `@UninstallModules(NetworkModule::class)` plus a nested `@Module @InstallIn(SingletonComponent::class)` that provides the fake.
- Quick one-off value: `@BindValue val clock: Clock = FakeClock()` (non-private field).
- Fakes for the network, the clock, the database (in-memory) and the dispatcher make the UI test deterministic. Never bind a production endpoint or real account.

## Robolectric

```kotlin
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
@Config(application = HiltTestApplication::class)
class ProfileRobolectricTest { ... }
```

The same test source rules apply, with `testImplementation` and `kspTest` or `kaptTest` instead. `@Config(application = ...)` replaces the custom runner.

## Failures

| Message | Likely cause |
| --- | --- |
| `Hilt Activity must be attached to an @HiltAndroidApp Application` | the runner (or `@Config`) does not use `HiltTestApplication` |
| `Missing binding` for a type the app provides | a module is `@InstallIn` a component that the test application does not include, or it was uninstalled without a replacement |
| `Component was not created` / used before `inject()` | `hiltRule.inject()` was not called, or the rule order is wrong |
| `Cannot use @TestInstallIn and @UninstallModules for the same module` | pick one mechanism per module |
| Works in the app, fails in `androidTest` only | the compiler artifact is missing for the test source set (`kspAndroidTest`) |
