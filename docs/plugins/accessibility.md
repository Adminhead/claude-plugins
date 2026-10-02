# accessibility

Adds a skill for manual screen-reader and keyboard testing of an implemented web journey. It is the home for future accessibility skills. Today it holds one, which replaces the user-level `screen-reader-testing` skill.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `accessibility:screen-reader-testing` | `screen-reader-testing` | Plan, run with you, and report manual screen-reader and keyboard tests covering names, roles, states, form errors, live announcements, dialogs, menus, and focus return |

The old bare name no longer works. Use the `accessibility:` prefix.

## Requirements

- A person to operate the screen reader. Claude cannot hear speech output. It writes the test script, records what you report, and diagnoses failures afterward.
- A screen reader and browser you can run. The skill names NVDA, JAWS, VoiceOver, Orca, and TalkBack. It records the OS, browser, screen reader, versions, and settings, because each combination is its own environment.
- For diagnosis, `playwright-cli:playwright-cli` (if installed) or the `claude-in-chrome` skill, to inspect the accessibility tree.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install accessibility@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/accessibility
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/accessibility
   ```
2. Start a fresh session. The skill list should show `accessibility:screen-reader-testing`.

## Limits

- The accessibility tree, emulators, and automated audits are diagnostic aids, not screen-reader evidence. With no human-operated session, the skill marks every scenario blocked.
- A result holds only for the environment that produced it.
- It tests the rendered experience. It does not choose visual design, prescribe generic fixes, or certify legal conformance.
- It is not for WCAG audits of designs (use `design:accessibility-review`, if installed) or automated axe checks.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable accessibility@adminhead` |
| Uninstall | `claude plugin uninstall accessibility@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
