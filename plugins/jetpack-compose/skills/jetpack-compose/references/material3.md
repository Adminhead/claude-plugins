# Material 3 theming

Read when creating or changing the app theme, or when a screen hard-codes colors or text styles. Original text; dynamic color facts verified 2026-11-01 against developer.android.com.

- One `AppTheme` composable wraps `MaterialTheme(colorScheme, typography, shapes, content)`. Screens read `MaterialTheme.colorScheme.*`, `MaterialTheme.typography.*` and `MaterialTheme.shapes.*`; no color literals or `sp` text sizes in screens.
- Dark mode: pick the scheme from `isSystemInDarkTheme()` unless the project has an in-app override setting.
- Dynamic color exists on Android 12 (API 31) and above. Guard it and fall back to static schemes (from Material Theme Builder output) below that:

```kotlin
val dynamicColor = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
val colorScheme = when {
    dynamicColor && darkTheme -> dynamicDarkColorScheme(LocalContext.current)
    dynamicColor -> dynamicLightColorScheme(LocalContext.current)
    darkTheme -> DarkColorScheme
    else -> LightColorScheme
}
MaterialTheme(colorScheme = colorScheme, content = content)
```

- Use role-paired colors (`primary` with `onPrimary`, `surfaceContainer` with `onSurface`) so contrast holds under dynamic color. Do not assume a brand color survives dynamic color; if brand identity matters, make dynamic color an opt-in.
- `Scaffold` passes `innerPadding` to its content; apply it, or the content sits under the bars. Insets beyond that go to `android-skills:edge-to-edge`.
- Prefer `material3` components. If the project uses Material 2 (`androidx.compose.material`), follow it; mixing both in one screen needs a reason.
- Component-level overrides go through the component's `XxxDefaults.colors(...)`, not by wrapping in another theme.
