# Output templates

One template per mode: [Audit](#audit), [Document](#document), [Extend](#extend). Drop sections that don't apply and say why rather than filling them with placeholders.

## Audit

```markdown
## Design System Audit: [System name]

### Summary
**Scope:** [token files, component dirs, screens reviewed] | **Components reviewed:** [X] | **Issues found:** [X]

### Naming consistency
| Issue | Components / tokens | Recommendation |
|-------|---------------------|----------------|
| [Inconsistent naming] | [List] | [Convention to adopt] |

### Token coverage
| Category | Tokens defined | Hardcoded values found | Where |
|----------|----------------|------------------------|-------|
| Colors | [X] | [X] hardcoded hex/rgb | [paths] |
| Spacing | [X] | [X] arbitrary values | [paths] |
| Typography | [X] | [X] custom sizes/fonts | [paths] |

### Component completeness
| Component | States | Variants | Sizes | Docs | Gaps |
|-----------|--------|----------|-------|------|------|
| Button | Complete | Complete | Complete | Partial | No usage guidance |
| Input | Missing focus, error | Partial | Complete | None | |

### Priority actions
1. [Most impactful improvement] — [why, effort, who it unblocks]
2. [Second priority]
3. [Third priority]
```

## Document

```markdown
## Component: [Name]

### Description
[What it is and when to use it; when to use something else instead]

### Variants
| Variant | Use when |
|---------|----------|
| [Primary] | [Main action on the page] |
| [Secondary] | [Supporting actions] |

### Props / properties
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| [prop] | [type] | [default] | [description] |

### States
| State | Visual | Behavior |
|-------|--------|----------|
| Default | [description] | — |
| Hover | [description] | [interaction] |
| Focus | [description] | [visible indicator, 3:1 contrast] |
| Active | [description] | [interaction] |
| Disabled | [description] | Non-interactive |
| Loading | [description] | [animation, announced] |

### Accessibility
- **Role**: [ARIA role or native element]
- **Keyboard**: [Tab, Enter, Space, Escape, arrow behavior]
- **Screen reader**: [announced as...]
- **Target size**: [at least 24x24 CSS px]

### Do's and don'ts
| Do | Don't |
|----|-------|
| [Best practice] | [Anti-pattern] |

### Code example
[Snippet in the project's framework, using its real component API]
```

## Extend

```markdown
## New Component: [Name]

### Problem
[The user need or gap this addresses]

### Existing patterns
| Related component | What's shared | Why it's not enough |
|-------------------|---------------|---------------------|
| [Component] | [Overlap] | [What's missing] |

### Proposed design

#### API / props
| Property | Type | Default | Description |
|----------|------|---------|-------------|

#### Variants
| Variant | Use when | Visual |
|---------|----------|--------|

#### States
| State | Behavior | Notes |
|-------|----------|-------|
| Default | | — |
| Hover | | |
| Focus | | |
| Disabled | | Non-interactive |
| Loading | | |

#### Tokens used
- Colors: [existing tokens; flag any new token and justify it]
- Spacing: [tokens]
- Typography: [tokens]

### Accessibility
- **Role**: [ARIA role or native element]
- **Keyboard**: [expected interactions]
- **Screen reader**: [announced as...]

### Open questions
- [Decision that needs design review]
- [Edge case to resolve]
```
