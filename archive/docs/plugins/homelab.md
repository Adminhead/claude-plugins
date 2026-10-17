# homelab

Adds `homelab:homelab-network`, a skill for planning and staging home and homelab network changes. It starts read-only. `homelab` is not in the `baseline` set. Install it where you run a homelab network, not in every project.

## What it adds

| Skill | Purpose |
| --- | --- |
| `homelab:homelab-network` | Plan and stage home or homelab network changes with a read-only-first contract: inventory, VLAN and trust-zone plans, default-deny rules between zones, Pi-hole or AdGuard DNS cutover with a fallback, WireGuard split versus full tunnel, and link diagnosis |

Before the regroup, this skill was in `infra`.

## Safety

- Inspecting and planning run freely.
- Any firewall, NAT, VLAN, DHCP, or VPN change needs your approval.
- The skill requires console or out-of-band access before it changes management VLANs, trunk ports, default firewall policy, or DHCP and DNS.
- It gives vendor syntax only for a confirmed platform and firmware.
- It never prints or stores private keys, preshared keys, or admin passwords.

## Requirements

None to install the plugin. The commands depend on your gateway and firewall, and the skill gives vendor syntax only once the platform and firmware are confirmed.

## Install

```
claude plugin install homelab@adminhead --scope local
```

To try it without installing:

```
claude --plugin-dir plugins/homelab
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/homelab
   ```
2. Start a fresh session. The skill list should show `homelab:homelab-network`.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable homelab@adminhead` |
| Uninstall | `claude plugin uninstall homelab@adminhead` |

The plugin ships only a skill and its references, so both commands remove everything. Start a new session to be sure it is gone.
