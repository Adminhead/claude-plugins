# Batch api-b report

## Plugins created

| Name | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `api-oauth-provider` | skill | OAuth 2.1 authorization-server design and review: grants and PKCE, redirect matching, token lifetimes, refresh rotation with reuse detection, scopes, consent, client registration and MCP auth. | archive api/skills/oauth-provider (orig. samber/developer-platform-skills `oauth2-provider-design`, MIT); archive api/evals/route-oauth-vs-auth | none |
| `api-graphql` | skill | Public GraphQL API design and review: when GraphQL fits, schema conventions, Relay pagination, result-union errors, query ceilings, federation boundary, persisted queries and field deprecation. | archive api/skills/graphql + GraphQL parts of api/skills/versioning (both developer-platform-skills, MIT) | none |
| `api-grpc` | skill | gRPC and protobuf contract design and review: AIP conventions, buf lint and breaking gates, proto diff compatibility, streaming, google.rpc.Status errors and gateway mapping. | archive api/skills/grpc (developer-platform-skills `public-grpc-api-design` + awesome-copilot `protobuf-grpc-api-review`, MIT) | none |
| `app-auth` | skill | Application-side authentication and authorization: sessions, password and recovery flows, OAuth/OIDC callbacks, JWT validation, tenant and ownership checks, cookies, CSRF and rate limits. | archive auth/skills/auth (own text; OAuth client rules partly from developer-platform-skills, MIT) | none |
| `better-auth` | skill | Better Auth library setup and debugging from version-matched docs: adapters, the auth CLI, route handlers, sessions, security options, email/password, two-factor and organizations. | archive auth/skills/better-auth, rewritten from better-auth.com docs | none |

Files: `plugins/<name>/.claude-plugin/plugin.json`, `plugins/<name>/skills/<name>/SKILL.md` + `references/`. MIT `LICENSE` with the upstream copyright lines in api-oauth-provider, api-graphql, api-grpc (Samuel Berthe + GitHub, Inc.) and app-auth. better-auth has no LICENSE: it contains no third-party text.

## Changes made

- Cross-references renamed: auth:auth -> `app-auth`, auth:better-auth -> `better-auth`, api:keys -> `api-keys`, api:idempotency-retry -> `api-idempotency`, api:rest-design / api:versioning -> `api-rest-design` (the versioning policy now lives there), coding-go:golang -> `golang`, db:redis -> `redis`, web:web-development -> `web-development`, testing:unit -> `unit-testing`, github-admin:actions -> `gh-actions`. "If installed" is on all of them. Long "Not for" lists moved from descriptions into the bodies. Descriptions are 280-335 chars.
- `app-auth`: the "Efficient Auth" heading is now "Application auth". `better-auth`: the "Efficient Better Auth" heading is now "Better Auth".
- `api-graphql`: new `references/evolution.md` holds the GraphQL side of the archived versioning skill: the continuous-evolution stance and its graphql.org quote, a per-field breaking/dangerous/safe definition (aligned with graphql-js `findBreakingChanges`/`findDangerousChanges`), communication, the GraphQL variant of the policy template, and measures. The REST half stays in api-a's `api-rest-design`.
- Routing eval `route-oauth-vs-auth` (handed over by api-a) moved to `plugins/api-oauth-provider/evals/`. Its graders now match `api-oauth-provider:api-oauth-provider` (fires) and `app-auth:app-auth` (must not fire). The other three archived api evals belong to api-a's plugins. I didn't copy them.

## Version-sensitive facts rechecked (2026-10-17)

- OAuth 2.1: datatracker reports draft-ietf-oauth-v2-1 still at revision 16, not yet an RFC.
- The MCP authorization spec has moved to **2026-07-28**, so the skill now cites it in place of 2025-11-25. Changes applied: Client ID Metadata Documents are now a SHOULD and DCR is **deprecated**, kept only for backward compatibility (it was a MAY). I added the new RFC 9207 `iss` authorization-response rule (servers SHOULD emit it, expected to become a MUST) and the scope-hierarchy MUST. Unchanged and confirmed in its security-considerations page: displaying the redirect hostname is a MUST, warning on localhost-only redirect URIs is a SHOULD, and RFC 9728, RFC 8707 `resource` and audience validation are MUSTs.
- buf docs confirm STANDARD as the default lint category, FILE as the default breaking category, and the UNARY_RPC category. graphql.org's "strong opinion on avoiding versioning" quote and the September 2025 spec edition are both still current.
- Better Auth: npm latest is 1.7.10 (the archive said 1.7.7). llms.txt lists v1.8 beta, v1.7 latest and v1.6. The `better-auth/plugins/two-factor`, `/plugins/access` and `/minimal` exports exist in 1.7.10. Each gotcha and security option was checked against the 1.7 docs pages: session-management (freshAge 1 day, storeSessionInDatabase, customSession caching caveat), rate-limit (auth.api exempt, off in dev, atomic `consume`, `/two-factor/*` limited to 3 per 10 s), security (disableOriginCheck also disables CSRF, ipAddressHeaders/trustedProxies/trustedProxyHeaders), 2fa (allowPasswordless, skipVerificationOnEnable, 30-day trusted device, ACCOUNT_TEMPORARILY_LOCKED shared counter), email-password and cli.

## better-auth provenance check

- The upstream `better-auth/skills` repo still has no license (GitHub's license API returns nothing). The review (archive/docs/research/third-party-skills-review.md, lines 135, 188, 499) said to reimplement from the docs and copy no text.
- Method: I fetched the 6 upstream SKILL.md files (best-practices, create-auth, emailAndPassword, organization, twoFactor, security) and ran a 6- and 8-token n-gram overlap against our skill, then read every hit.
- Result: the archived skill is substantially a rewrite. The only shared runs of 8+ tokens are code that appears verbatim in the official docs (the `sendResetPassword`/`void sendEmail` snippet in docs authentication/email-password, plus API identifiers). Four passages were close paraphrases of upstream wording and **I rewrote them from the official docs**:
  1. SKILL.md section 1, version matching. It mirrored upstream best-practices' numbered steps, including the "when planning an upgrade" sentence. Rewritten from better-auth.com/llms.txt.
  2. email-password.md, the "absolute URLs ... different domains" bullet. It paraphrased an upstream sentence that isn't in the docs. Rewritten from docs reference/security (trustedOrigins and callbackURL validation).
  3. email-password.md, the "To use Argon2id or another algorithm" lead-in. Rewritten from the docs' hashing section.
  4. setup.md, the CLI config search-path sentence. Rewritten from docs concepts/cli.
- Also reworded the cookie-cache gotcha to the docs' caveat (it covers secondary storage too) and added a Provenance section to SKILL.md. After the rewrite, a re-run of the n-gram check shows only the docs code snippet and API identifiers.

## Validation

- `claude plugin validate --strict plugins/<name>` passed for all five.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>` reports valid for all five. SKILL.md bodies are 90-101 lines.
- A grep for codegraph, claude-mem, coding-core:, github:, `Efficient `, coding-go:, api:*, auth:*, testing:, web:, db: finds nothing.
- No scripts, mods or tests in this batch. The eval was not run (`claude plugin eval` is costly and the brief doesn't require it).

## Deviations

- `app-auth` gets an MIT LICENSE and an "adapted in part" line for the three OAuth client rules that came via `oauth2-provider-design`. They are RFC 9700 requirements, but crediting the source is cheap.
- `api-graphql` takes the versioning skill's GraphQL material as a new reference with an expanded breaking/dangerous classification, not as a verbatim excerpt.

## Unverified / TODO

- RFC numbers and the AIP and gateway details in the grpc references weren't re-fetched. Only the buf defaults were rechecked.
- graphql-inspector is named as one example schema-diff tool. Its CLI flags weren't checked.
- The organization and two-factor references were spot-checked, not read line by line against the docs.

## Suggested follow-ups

- Run `claude plugin eval plugins/api-oauth-provider` after registration. Add trigger evals for api-graphql, api-grpc, app-auth and better-auth (none existed in the archive).
- Recheck the MCP spec when a version after 2026-07-28 ships: the `iss` rule is expected to become a MUST.
