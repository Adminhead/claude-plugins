# Doc types and README rules

Read this when writing a new page or reorganizing an existing one. Pick one type per page, because mixing them serves no reader well. The four types come from the Diataxis framework (diataxis.fr).

| Type | Reader's need | Shape | Test |
| --- | --- | --- | --- |
| Tutorial | Learn by doing | A guided lesson to one working result, with every step shown | A newcomer finishes it without outside help |
| How-to | Solve a specific problem | Steps for a goal the reader already has, with no theory | The goal is in the title and the steps reach it |
| Reference | Look up facts | Complete, structured, neutral description of the machinery | Every option, flag, or field is covered |
| Explanation | Understand why | Context, trade-offs, alternatives, and history | A reader can answer "why is it this way?" |

## Before writing

Establish four things, and ask only about the ones the repo cannot answer:

1. The doc type.
2. The audience and what they already know.
3. The goal the reader wants to reach.
4. The scope, including what the page leaves out.

For a long page, share the outline first. Match the tone, terms, and structure of the existing docs, and do not copy their content.

## Principles

- **Accurate.** Run every command and code sample, because a wrong example does more harm than a missing one.
- **Goal-first.** Each page helps a specific reader do a specific task.
- **Consistent.** One term per concept throughout the docs.
- **Plain.** Short sentences, concrete nouns, active verbs.

## README

A README answers: what is this, how do I run it, where do I go next.

- Lead with one sentence on what the project does and who it is for.
- Give install and a minimal working example that you ran.
- Link to deeper docs and leave detail to them.
- Leave out licence text, contribution rules, and changelogs, because dedicated files own them.
- Use plain GitHub-flavored Markdown, and add a logo or admonition only when it helps.
