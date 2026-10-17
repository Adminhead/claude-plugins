# Scopes and consent

Read when defining a scope set or building the consent screen.

## Scope design

1. Start from `resource:action`, with read and write split and read-only as the default grant.
2. Make scopes additive. To change what a scope grants, add a new scope and deprecate the old one on a published schedule (the versioning policy in `api-rest-design`, if installed). A scope change can also invalidate refresh tokens and force re-consent.
3. Split a scope when resource types differ in sensitivity. Four history scopes for four conversation types cost more decisions but stop a direct-message grant from silently covering private channels. Accept the scope count.
4. If both app-identity and user-delegated access exist, store the token type with the scope definition. The same name can mean "act as the app" on one and "act as the user" on the other, so make the binding explicit.
5. Put high-privilege and org-wide scopes behind admin consent.
6. Check at runtime that a request's scopes are a subset of what the app declared and had approved, since declarations drift.

## Consent screen

- One plain sentence per scope, in the user's language.
- Show the verified app name and the redirect hostname.
- On re-consent, list only the new scopes.
- Handle a partial grant. The token response's `scope` is the source of truth, and the app must compare it to what it asked for.
- Test the diff: request three scopes, approve two, and confirm the integration reacts.

## Verification tiers

Scale review to data sensitivity rather than using one bar for every app.

| Tier | Trigger | What it proves |
| --- | --- | --- |
| Publisher identity | Every listed app | Who operates the app (continuity, not quality) |
| Self-attestation | Moderate-risk scopes | Stated controls, unverified |
| Independent assessment | Scopes reaching other users' data or PII | Verified controls |

Keep the three signals visually distinct in the app directory. One checkmark for all three misleads buyers. Enforce limits at runtime for unverified apps, including a hard user cap on the testing lane.

Do not cite consent drop-off percentages. No rigorous study backs the figures in circulation, so argue for minimal scopes and clear copy on security and usability grounds.
