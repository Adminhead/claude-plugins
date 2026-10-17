# Anthropic-Cybersecurity-Skills

Source: https://github.com/mukul975/Anthropic-Cybersecurity-Skills · License: Apache-2.0 · Last commit: 2026-08-31 04:32:42 +0000 · Catalog: [catalog.md](catalog.md)

## Purpose

A library of 818 agentskills.io-format `SKILL.md` procedures covering offensive and defensive security: web and API security, pentesting, red teaming, DFIR, threat intelligence, cloud, OT/ICS, malware analysis, and compliance. Despite the name, this is **not** an Anthropic project. The README says it is an "independent, community-created project" and "Not affiliated with Anthropic PBC." It is maintained by **mukul975** (the marketplace owner and plugin author in `.claude-plugin/marketplace.json`). Individual skills carry an `author` field that differs; the sampled skill lists `mahipal`, who also runs the GARS-2026 survey linked from the README. The repo is a single plugin, `cybersecurity-skills` v1.3.0, shipped as a marketplace of one. It contains skills only: no agents, commands, or hooks.

## Layout

| Path | Contents |
|---|---|
| `skills/<name>/` | 818 skill directories (flat, no category dirs) |
| `skills/<name>/SKILL.md` | YAML frontmatter plus Markdown procedure |
| `skills/<name>/scripts/agent.py` | Per-skill Python helper (all 818 have one) |
| `skills/<name>/references/`, `assets/`, `LICENSE` | Reference docs, some assets, Apache-2.0 copy |
| `.claude-plugin/` | `marketplace.json` and `plugin.json` |
| `tools/` | Python validators, index generator, collision and lint checks |
| `mappings/` | ATT&CK, NIST CSF, OWASP mapping data and an ATT&CK Navigator layer |
| `docs/` | `mitre-f3-mapping.md` |
| `index.json` | Generated skill index (447 KB) |
| `ATTACK_COVERAGE.md`, `SCOPE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md` | Project docs |
| `README.md`, `README.fr.md` | English and French READMEs |

## Counts

Counts from the catalog header (`catalog.md`), checked against the repo:

| Kind | Count |
|---|---|
| Marketplaces | 1 |
| Plugins | 1 |
| Skills | 818 |
| Agents | 0 |
| Commands / prompts | 0 |
| hooks.json files | 0 |

The README body says 817 in several places (e.g., "817 skills across 34 domains"). The directory has 818, so the README is stale.

## Categories

Categories come from the `subdomain` frontmatter field, not from directories (the layout is flat). Top 30 of 46 distinct values:

| Category (`subdomain`) | Skills |
|---|---:|
| cloud-security | 66 |
| threat-hunting | 58 |
| threat-intelligence | 52 |
| network-security | 43 |
| web-application-security | 42 |
| digital-forensics | 41 |
| malware-analysis | 39 |
| identity-access-management | 37 |
| soc-operations | 35 |
| red-teaming | 33 |
| container-security | 33 |
| security-operations | 28 |
| ot-ics-security | 28 |
| api-security | 28 |
| incident-response | 26 |
| vulnerability-management | 25 |
| penetration-testing | 21 |
| devsecops | 18 |
| zero-trust-architecture | 17 |
| endpoint-security | 17 |
| cryptography | 16 |
| phishing-defense | 15 |
| ai-security | 14 |
| mobile-security | 13 |
| ransomware-defense | 13 |
| compliance-governance | 10 |
| supply-chain-security | 8 |
| threat-detection | 7 |
| deception-technology | 6 |
| hardware-firmware-security | 4 |

The remaining 16 values hold 1 to 4 skills each. Several are spelling variants of others (e.g., `identity-and-access-management`, `identity-security`, `zero-trust`, `red-team`, `offensive-security`, `firmware-security`, `ot-security`). `soc-operations` and `security-operations` overlap.

## Install / use

From the README, verbatim:

```bash
# Option 1: npx (recommended)
npx skills add mukul975/Anthropic-Cybersecurity-Skills

# Option 2: Git clone
git clone https://github.com/mukul975/Anthropic-Cybersecurity-Skills.git
cd Anthropic-Cybersecurity-Skills
```

The README says it "works immediately with Claude Code" and other agents, but gives no Claude Code plugin command. The repo does ship `.claude-plugin/marketplace.json`, so a Claude Code marketplace add may work. This was not tested.

## Highlights

- `skills/operating-sliver-c2/` - 304-line Sliver C2 operating guide with legal notice and ATT&CK T1071.001 mapping (dual-use).
- `skills/abusing-dpapi-for-credential-access/` - DPAPI secret extraction via SharpDPAPI and Impacket; `scripts/agent.py` shells out to those tools.
- `skills/analyzing-active-directory-acl-abuse/` - ldap3 scanner with a concrete access-mask table (GenericAll, WriteDACL, WriteOwner, and others) and admin-SID filtering.
- `skills/achieving-cmmc-level-2-compliance/` - 142-line CMMC / SPRS / POA&M guide tied to DFARS 252.204-7012/7019/7020/7021.
- `skills/acquiring-disk-image-with-dd-and-dcfldd/` - 245-line forensic imaging procedure with hash verification.
- `skills/assessing-vector-and-embedding-weaknesses/` - RAG vector-store tests (embedding inversion, cross-tenant leakage), mapped to ATLAS AML.T0024.
- `skills/implementing-patch-management-for-ot-systems/` - ICS patch SLA and downtime/safety risk scoring in an 82-line `agent.py`.
- `skills/analyzing-network-packets-with-scapy/` - 61 lines, the shortest skill; a thin example.
- `skills/analyzing-api-gateway-access-logs/` - pandas-based BOLA/IDOR and rate-limit detection; uses a folded, quoted description.
- `skills/performing-initial-access-with-evilginx3/` - phishing reverse-proxy workflow; a clear example of gated content.

## Quality notes

- **Template shape, uneven substance.** Standard headings recur across the set: Prerequisites (822 hits), When to Use (817), Workflow (604), Key Concepts (473), Output Format (345). The sampled bodies carry domain specifics (registry paths, DFARS clauses, mask constants, command lines), so they are not empty boilerplate. Depth varies: median 256 lines, minimum 61.
- **Frontmatter is complete and valid.** All 818 `SKILL.md` files parse as YAML and have `name`, `description`, `domain`, `subdomain`, `tags`, `version`, `author`, `license`. `name` matches the directory for all 818. `mitre_attack` is on 806, `nist_csf` on 805, and `mitre_f3` on 94. Two descriptions are duplicated.
- **Descriptions are long.** Median about 400 characters, range 97 to 1016. Many include "Use when..." trigger text, which fits progressive loading.
- **Scripts are scaffolding.** Every skill has `scripts/agent.py` (82 to 91 lines in the smallest cases). Most follow one argparse, logging, JSON-report pattern. Logic varies: the DPAPI script runs real tools, while the OT one works on JSON input.
- **Mappings can look loose.** The CMMC compliance skill carries ATT&CK T1567 and T1041, which seem unlikely for a compliance guide. Framework tags were not audited.
- **Dual-use is heavy.** 356 `SKILL.md` files contain a legal notice or "authorized" text. About 64 descriptions use offensive terms (Sliver, Havoc, C2, evasion, bypass, exploit). The red-teaming category includes C2 frameworks, Evilginx3, spearphishing campaigns, NTLM relay, Kerberoasting, and exploitation of ZeroLogon, NoPac, and EternalBlue.
- **Maintenance.** Last commit was 2026-08-31, about 7 weeks before today. Version is 1.3.0. The README's 817 count is stale, and the project ships validators in `tools/`.

## Relevance to adminhead

- This is a **skills library, not a plugin**. Its flat `skills/<name>/SKILL.md` layout would need wrapping before it could sit in the marketplace.
- Apache-2.0 allows redistribution with attribution and license retention. The copy here is gitignored (`/3rd-party/` in `.gitignore`) and is not vendored.
- Any adminhead plugin built from it should gate offensive skills (C2, phishing, exploitation) as opt-in and keep them out of defaults. The repo's own legal notices and the "authorized use only" framing are not an access control.
- The `scripts/agent.py` helpers are plain Python, not mods hooks. They do not fit the `claude-code` mods API. They could be reused only through a hook-side script, not a `register.tsx`.
