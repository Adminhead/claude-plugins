# MADR templates

[MADR](https://github.com/adr/madr) is an optional, richer alternative to this skill's default Nygard format. Adopt it only when the repository explicitly chooses MADR; do not mix these fields into generated Nygard ADRs. MADR's upstream convention uses `docs/decisions/` and `nnnn-title`; this skill's default remains `docs/adr/` with Nygard. `new_adr.py --format madr` emits the minimal template with `status` and `date` frontmatter.

The full template supports removable metadata (`status`, `date`, `decision-makers`, `consulted`, and `informed`), Context and Problem Statement, optional Decision Drivers, Considered Options, Decision Outcome, optional Consequences and Confirmation, optional Pros and Cons of Options, and optional More Information. The minimal template requires a title, Context and Problem Statement, Considered Options, and Decision Outcome; Consequences are optional. Status examples include Proposed, Rejected, Accepted, Deprecated, and Superseded by ADR-0123.

## Full template

```markdown
---
# These are optional metadata elements. Feel free to remove any of them.
status: "{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123}"
date: {YYYY-MM-DD when the decision was last updated}
decision-makers: {list everyone involved in the decision}
consulted: {list everyone whose opinions are sought}
informed: {list everyone kept up-to-date}
---

# {short title, representative of solved problem and found solution}

## Context and Problem Statement

{Describe the context and problem statement. Make the scope of the decision explicit.}

<!-- This is an optional element. Feel free to remove. -->
## Decision Drivers

* {decision driver 1}
* {decision driver 2}

## Considered Options

* {title of option 1}
* {title of option 2}
* {title of option 3}

## Decision Outcome

Chosen option: "{title of option 1}", because {justification}.

<!-- This is an optional element. Feel free to remove. -->
### Consequences

* Good, because {positive consequence}
* Bad, because {negative consequence}
* Neutral, because {neutral consequence}

<!-- This is an optional element. Feel free to remove. -->
### Confirmation

{Describe how implementation or compliance will be confirmed.}

<!-- This is an optional element. Feel free to remove. -->
## Pros and Cons of the Options

### {title of option 1}

* Good, because {argument}
* Neutral, because {argument}
* Bad, because {argument}

### {title of other option}

* Good, because {argument}
* Neutral, because {argument}
* Bad, because {argument}

<!-- This is an optional element. Feel free to remove. -->
## More Information

{Additional evidence, agreement, implementation timing, review conditions, or links.}
```

## Minimal template

```markdown
# {short title, representative of solved problem and found solution}

## Context and Problem Statement

{Describe the context and problem statement. Make the scope of the decision explicit.}

## Considered Options

* {title of option 1}
* {title of option 2}
* {title of option 3}

## Decision Outcome

Chosen option: "{title of option 1}", because {justification}.

<!-- This is an optional element. Feel free to remove. -->
### Consequences

* Good, because {positive consequence}
* Bad, because {negative consequence}
* Neutral, because {neutral consequence}
```

## Check for updates

- [MADR canonical repository](https://github.com/adr/madr)
- [Current full template](https://raw.githubusercontent.com/adr/madr/main/template/adr-template.md)
- [Current minimal template](https://raw.githubusercontent.com/adr/madr/main/template/adr-template-minimal.md)

Compare both upstream template files when revising this reference.
