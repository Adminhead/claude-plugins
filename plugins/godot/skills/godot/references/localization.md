# Localization

Translating a Godot game: `tr()` and `tr_n()`, key strategy, CSV versus PO files, registration, automatic Control translation, locale switching, RTL, fonts and the 4.5 to 4.7 additions. Text-expansion and font planning for UI belongs with the `game-ui` skill. Written for Godot 4.x, checked against 4.7.

## Workflow

1. Wrap every player-facing string in `tr()`, or set a Control's `text` to the key and let auto-translation handle it.
2. Write translations as CSV (small teams, spreadsheets) or PO (translator tools such as Poedit, Weblate, Crowdin).
3. Register the files in Project Settings > Localization > Translations. Registered files load at startup, before any scene.
4. Switch with `TranslationServer.set_locale("de")`. Save the choice in the settings file and apply it at startup.
5. Check overflow and RTL in the editor (4.5+ Preview Translation) and in a run.

## Keys

| Strategy | Example | Use |
| --- | --- | --- |
| Semantic keys | `MENU_MAIN_START` | Production. Stable when the English text changes. Needs an English column. |
| Source text as key | `Start Game` | Prototypes and solo projects. Every English edit orphans the translations. |

Name keys `AREA_CONTEXT_THING` (`HUD_HEALTH_LABEL`, `ITEM_SWORD_DESC`). Split files by area (`ui.csv`, `items.csv`, `dialogue.csv`) to keep merges small.

## Formatting and plurals

```gdscript
health_label.text = tr("HUD_HEALTH") % hp                      # format after tr()
var msg := tr_n("ENEMY_COUNT", "ENEMY_COUNT_PLURAL", n) % n    # pick the form, then format
var noun := tr("FILE", "noun")                                   # second argument is the context
```

- Format after translating: `tr("KEY") % value`, never `tr("KEY" % value)`.
- Prefer named placeholders when word order differs by language: `tr("ITEM_GOT").format({"item": tr(item.name_key)})` with `{item}` in the translation.
- `tr_n()` needs plural forms in the file: PO `msgid_plural`, or 4.6+ CSV plural rows.
- GDScript has no locale-aware number or date formatting; `"%d" % 1234567` always prints `1234567`. Group digits yourself or keep numbers unformatted. C# can use `CultureInfo` (`godot-csharp`).

## CSV

```csv
keys,en,de,ja
MENU_START,Start Game,Spiel starten,ゲームスタート
HUD_HEALTH,Health: %d,Gesundheit: %d,体力: %d
```

- First column is the key; the other headers are locale codes. Columns starting with `_` are ignored (translator notes).
- Quote cells that contain commas; double quotes escape as `""`. Delimiter (comma or tab) is an import option.
- Each CSV imports to one `.translation` file per locale beside it. Commit the CSV and its `.import`; the generated files are rebuilt on import.
- 4.6+: a `?context` column disambiguates identical keys (`tr(key, context)`).
- 4.6+: a `?plural` column holds the plural source string; extra plural forms go on continuation rows with an empty key, one row per form, so 3-form languages (Czech, Russian, Polish) work. An optional `?pluralrule` row overrides a locale's rule (`nplurals=2; plural=(n >= 2);`).
- Automatic Control translation skips context and plural entries; call `tr()`/`tr_n()` in code for those.

## PO

- Generate a POT from the project: Project Settings > Localization > Template Generation lists the scenes and scripts to scan, then generate `messages.pot`. Translators make `de.po` etc. from it; update with `msgmerge`.
- PO carries translator comments, context (`msgctxt`) and plurals natively. Pick PO when outside translators are involved.
- 4.7+: the POT generator also extracts `Control.accessibility_name` and `accessibility_description`.
- 4.7+: an `EditorTranslationParserPlugin` can override `_customize_strings()` to add or drop entries after parsing (for example, drop internal strings that start with `$`).

## Automatic Control translation

- `Label`, `Button`, `RichTextLabel` and other Controls translate `text`, `tooltip_text` and `placeholder_text` when the value is a key in a loaded translation.
- 4.3+: `auto_translate_mode` on `Node` (`AUTO_TRANSLATE_MODE_INHERIT` default, `ALWAYS`, `DISABLED`) replaced the old `auto_translate` bool. A child inherits a parent's `DISABLED`, which can silently stop translation in a whole subtree. Set `DISABLED` on labels that show player names, chat or numbers.
- 4.7+: `Control.translation_context` gives a control a context for both display and POT generation, like `tr()`'s second argument.
- Strings built in code do not retranslate on a locale switch. Rebuild them on the change notification.

## Locale changes

`TranslationServer` has no signals. Nodes receive `NOTIFICATION_TRANSLATION_CHANGED`:

```gdscript
func _notification(what: int) -> void:
    if what == NOTIFICATION_TRANSLATION_CHANGED and is_node_ready():
        _refresh_texts()
```

- `TranslationServer.get_locale()`, `get_loaded_locales()` for the language menu. Show each language in its own name ("Deutsch", "日本語").
- Set a fallback locale in `internationalization/locale/fallback` so missing keys fall back to English, not the raw key.
- Test a locale from the command line with `--language de`, or set `internationalization/locale/test` in the project (editor runs only).

## RTL and fonts

- `layout_direction`: `LAYOUT_DIRECTION_INHERITED`, `LAYOUT_DIRECTION_APPLICATION_LOCALE` (from the loaded translation; only flips when a translation for that RTL language is loaded), `LAYOUT_DIRECTION_LTR`, `LAYOUT_DIRECTION_RTL`, `LAYOUT_DIRECTION_SYSTEM_LOCALE`. Set it on the root UI Control and let children inherit.
- Force RTL for testing with `internationalization/rendering/force_right_to_left_layout_direction`.
- `structured_text_type` on Label and LineEdit keeps URLs, file paths and emails from reversing. In `RichTextLabel`, wrap embedded LTR runs in `[ltr]...[/ltr]`.
- RTL and complex scripts need the Advanced text server (the default). With `TextServerFallback` layout is always LTR.
- The default font does not cover CJK, Arabic or Hebrew. Import Noto (or similar) fonts and add them as fallbacks on the theme's main font so every locale renders. Consider a font per locale in the theme for CJK quality.

## Editor and QA

- 4.5+: View > Preview Translation in the 2D editor renders scenes in any loaded locale to catch overflow and RTL problems without running. Editor only.
- Plan for German and Finnish strings 30 to 40 percent longer than English: containers, `autowrap_mode`, `text_overrun_behavior`, no fixed widths.
- Pseudolocalization (`internationalization/pseudolocalization/use_pseudolocalization` and its options) lengthens and accents strings to find untranslated or clipped text.

## Pitfalls

- Key shows on screen: the file is not registered, the locale has no column, or the key has a typo. Registering at runtime with `TranslationServer.add_translation()` works but loses the startup guarantee.
- Text stays in the old language after switching: it was built in code once; refresh it on `NOTIFICATION_TRANSLATION_CHANGED`.
- A node stopped translating after an upgrade from 4.2: an ancestor's `auto_translate_mode` is `DISABLED`.
- Literal `%s` on screen: the value was formatted into the key before `tr()`.
- Dialogue lines: give each line an ID key rather than raw text (see the `game-genres` dialogue reference).
