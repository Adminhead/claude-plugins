# Report template

Read when writing the threat model document. Keep it as short as the system allows. Drop a section the system has no content for.

## Document skeleton

1. **Scope and context.** What was modeled, the commit, deployment classification (internet-facing service, internal service, localhost app, library), assumptions, and what could not be verified.
2. **Architecture.** Components, stores, external services, actors, and the security controls found.
3. **Data-flow diagram.** Mermaid, trust boundaries drawn, flows labeled with protocol and data class.
4. **Threats by component.** One section per component with a STRIDE table (threat, category, tier, status).
5. **Findings.** Ordered by tier, then impact.
6. **Requirements and control mapping.** One row per threat.
7. **Attack trees.** For the top one or two goals.
8. **Verification gaps.** Claims that rest on an unconfirmed platform default or missing evidence.

Threat status values are Open, Mitigated (control confirmed in code), and Platform (handled by the platform, with the default cited). There is no "accepted" status, because accepting risk is the team's decision.

## Finding format

```markdown
### F-07: Webhook handler trusts unsigned payloads
- Component: billing-webhook (process)
- STRIDE: Spoofing, Tampering
- Tier: 1 (prerequisite: none; route is public in `deploy/ingress.yaml:42`)
- Evidence: `src/webhooks/stripe.ts:18` parses the body before any signature check
- Impact: forged events can mark orders paid
- CWE: CWE-345 (insufficient verification of data authenticity)
- CVSS 4.0: CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:H/VA:N/SC:N/SI:N/SA:N
- Remediation: verify the provider signature against the raw body before parsing
- Requirement: the handler rejects events with a missing or invalid signature (test: send a tampered body, expect 400)
```

Include a CVSS vector only when you can justify each metric from the evidence. The v4.0 base metrics are AV, AC, AT, PR, UI, VC, VI, VA, SC, SI, SA. Look up CWE ids in the MITRE CWE list and do not guess one.

## Requirement and control table

| Threat | Requirement (testable) | Preventive | Detective | Corrective | Single control? |
| --- | --- | --- | --- | --- | --- |
| F-07 forged webhook | Reject invalid signatures | Signature check | Alert on rejected-signature spike | Replay-safe reconciliation job | Yes, add detection |

Flag a row where one control stands between the attacker and the impact. Suggest a second layer from a different category (application, data, network, process).

## Attack tree

Pick the attacker's goal as the root. Children are OR (any one works) or AND (all required). Leaves are atomic steps.

```
Read another tenant's data                         [goal]
├─ OR  Abuse an object-id endpoint (IDOR)          cost: low, skill: low, detectable: low
├─ OR  Steal a session
│   ├─ AND  Find XSS in the profile page           cost: low, skill: med
│   └─ AND  Lure a tenant admin to the page        cost: low, skill: low
└─ OR  Reach the database directly                 cost: high, skill: high, detectable: high
```

Defend the cheap, low-detection branches first.

## Sources

- OWASP Threat Modeling Cheat Sheet, https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html (STRIDE categories and four-question framing).
- FIRST CVSS v4.0 specification, https://www.first.org/cvss/v4-0/specification-document (base metrics and vector format).
