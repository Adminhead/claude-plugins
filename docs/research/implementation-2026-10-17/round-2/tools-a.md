# Batch tools-a report

## Plugins created

| Name | Type | Description (= plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `devenv` | S | devenv.sh skill: configure, migrate, debug and verify developer environments in devenv.nix and devenv.yaml, with option shapes checked against the installed version and secrets kept out of Nix evaluation. | archive devenv/skills/devenv | none |
| `chezmoi` | S | chezmoi dotfiles skill: source-state attributes, templates and machine data, age and password-manager secrets, externals and run_ scripts, behind a preview-first apply gate. | archive chezmoi/skills/chezmoi (+6 refs) | none |
| `pass-cli` | S | Proton Pass CLI skill: find vaults and items by ID, build pass:// references, and inject secrets into a process or file without ever printing them. | archive pass-cli/skills/pass-cli (+3 refs) | none |
| `homelab-network` | S | Home and homelab network planning, read-only first: inventory, VLANs and trust zones, default-deny firewall rules, Pi-hole DNS cutover, WireGuard remote access and interface error diagnosis. | archive homelab/skills/homelab-network (+4 refs); originally adapted from ECC homelab-* and network-interface-health (MIT) | none |

All four are suited to user scope (personal tools), per the archive-b inventory.

## Validation and tests

- `claude plugin validate --strict plugins/<name>` passes for all four.
- No evals, scripts or tests came with these archived skills, so there is nothing to run.
- grep for `codegraph`, `claude-mem`, `coding-core:`, `github:`, `Efficient `, `git:commit`, `pass-cli:`, `chezmoi:chezmoi`, `deploy:`, `aws:`, `dynamic-workflows`: no hits.
- SKILL.md descriptions: 279-359 chars; bodies 56-111 lines.

## Version checks (2026-10-17)

- devenv 2.3.1 (local `devenv --help` and subcommand help) and Context7 `/cachix/devenv`. Added: `-O attr:type value` option overrides, `-o` input overrides, `tasks list` / `--mode`, `devenv processes wait|status|logs`, `up --strict-ports` / port auto-allocation, `devenv generate` caution, `devenv gc`, SecretSpec runtime loading (`secretspec run -- cmd`) as best practice vs `config.secretspec.secrets.*` which enters evaluation, `secretspec.toml` row. Kept `--override-dotfile`, `eval`, `changelogs`, `inputs add`, `update <name>`.
- chezmoi v2.73.1 (local help): confirmed `execute-template --init --promptString`, `update --apply`, `age-keygen --output`, `doctor --no-network`, `--refresh-externals`, `--keep-going`, `--force`, and that `protonPass`/`protonPassJSON` exist. New: warned against `chezmoi push` (git add/commit/push of everything).
- pass-cli 2.4.2 (local help and `pass-cli agent instructions`): confirmed run/inject/item view/item list/login flags and the agent-reason env var. Secret rules tightened: added `item totp`, `totp generate`, `password generate` / `--generate-password` output to the must-not-print list; new rule against secret values in argv (`item create --password`, `item update --field password=`, `password score`, `login --pat`); approval needed for `ssh-agent load|start|daemon`, `session remove-lock`, key-storage settings. Corrected `inject -f` meaning (skips confirmation prompt; `--file-mode` applies only with `-o`).
- Pi-hole docs (Context7 `/pi-hole/docs`): `FTLCONF_dns_listeningMode=all` (lowercase), `WEBPASSWORD_FILE` + Compose secret, `NET_ADMIN` for DHCP or IPv6 RA, host networking or DHCP relay for DHCP.

## Deviations

- Removed machine-specific lines ("This machine has Proton Pass", "this config uses age", "Installed here is v2.4.x") since plugins now ship from a marketplace; replaced with "check `chezmoi cat-config`" and "checked on v2.4.2".
- `homelab-network`: added the ECC attribution line and an MIT `LICENSE` (ECC copyright) that the archive lacked. Its "Not for ..." list moved to the body with new names (`aws-well-architected`, `kubernetes`, `docker`).
- `devenv` references `devcontainer` and `pre-commit` skills "if installed" (devcontainer is a planned phase-6 plugin).
- Added a short Report section to `devenv` (others already had one).

## Unverified / TODO

- `devenv generate` sends project details to a hosted generator: from memory of devenv.new; the local help only says "using AI".
- WireGuard, OPNsense rule-order and interface-health facts were not rechecked (not CLI-version facts; carried from the archive, which cited wireguard.com and docs.opnsense.org).
- pass-cli: whether `item create --generate-password` prints the value is unknown; the skill treats it as possibly printing.
- No trigger evals exist for these four.

## Suggested follow-ups

- Write 2-3 trigger evals each (e.g. pass:// in a chezmoi template should fire pass-cli and chezmoi; a NixOS config question should not fire devenv).
- Consider a `dotfiles` or `tools` grouping later if devenv/chezmoi/pass-cli are often installed together; for now direct installs per plan.
