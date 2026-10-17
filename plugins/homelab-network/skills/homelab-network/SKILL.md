---
name: homelab-network
description: Plans and stages home or homelab network changes read-only first: inventory, VLANs and trust zones, default-deny rules, Pi-hole or AdGuard DNS cutover, WireGuard and interface errors. Use when splitting a flat network into VLANs, moving DHCP clients to a local resolver, adding VPN access, or reviewing a change that could lock the operator out.
---

# Homelab network changes

Not for cloud networking (`aws-well-architected`, if installed), Kubernetes NetworkPolicy (`kubernetes`, if installed), or container networking (`docker`, if installed).

A network change that goes wrong takes away the connection you would use to fix it. The first answer is therefore a plan: inventory, risks, staged steps, validation, and rollback. Platform-specific commands come after the platform, the topology, and a rollback path are confirmed.

## Safety rules

- Stay read-only until the user approves a specific step. Inspect and plan first. Apply no firewall, NAT, VLAN, DHCP, or VPN change from this skill without that approval.
- Require console, out-of-band, or same-room access before changing management VLANs, trunk ports, default firewall policy, or DHCP and DNS settings, and know which port the operator is connected through.
- Keep a working path to the internet before pointing the network at a new resolver or VPN route.
- Keep gateway, DNS, SSH, NAS, hypervisor, and VPN admin interfaces off the public internet.
- Treat IoT, guest, camera, and lab-server networks as separate trust zones unless the user chooses otherwise.
- Give vendor syntax only for a confirmed platform and firmware. Commands from another vendor or version are a common cause of lockouts.
- Never print or store private keys, preshared keys, or admin passwords. Use `<placeholder>` values in plans and files.

## Required inventory

Collect this before giving implementation steps.

| Area | Questions |
| --- | --- |
| Internet edge | Modem or ONT? Is the ISP router bridged or still routing? Is the WAN address behind CGNAT? |
| Gateway | What routes, firewalls, serves DHCP, and terminates VPNs? Vendor and firmware version? |
| Switching | Which ports are uplinks, access, trunks, or unmanaged? |
| Wi-Fi | Which SSIDs map to which networks? Are APs wired or mesh? |
| Addressing | Which subnets exist, and which overlap with VPN sites or other networks you visit? |
| DNS and DHCP | Which service hands out leases and resolver addresses? |
| Management | How will you reach gateway, switch, and APs after the change? |
| Recovery | What can be reverted locally if DNS, DHCP, VLANs, or VPN routes break? |

## Zone plan

Plan intent first and vendor syntax later.

| Zone | Contents | Default policy |
| --- | --- | --- |
| Trusted | Laptops, phones, admin workstations | Reaches shared services and management when needed |
| Servers | NAS, Home Assistant, lab hosts, DNS resolver | Accepts narrow inbound flows from trusted clients |
| IoT | TVs, plugs, cameras, speakers | Internet plus named exceptions |
| Guest | Visitor devices | Internet only |
| Management | Gateway, switches, APs, controllers | Reachable only from trusted admin devices |
| VPN | Remote clients | Same as or narrower than trusted |

- Pick non-overlapping subnets. Avoid `192.168.1.0/24` when VPN access is planned, because hotels, offices, and ISP routers use it and routes collide.
- Reserve infrastructure addresses (gateway, DNS, controller, APs, NAS, VPN endpoint) with DHCP reservations or a static range per subnet.
- Use `home.arpa` for local names. RFC 8375 reserves it for home networks, and its queries stay on the local resolver. Avoid `.local`, which collides with mDNS.
- Before choosing VLAN IDs, confirm the gateway does inter-VLAN routing with firewall rules, the switch supports the tagged and untagged behavior needed, the APs map SSIDs to VLANs, and management stays reachable after trunk and SSID changes.

## Change sequence

1. Snapshot topology, IP plan, DHCP, DNS, and firewall rules (export the config).
2. Reserve infrastructure addresses.
3. Create the new zone without moving critical devices.
4. Move one test client and check DHCP, DNS, routing, internet, and blocking.
5. Add narrow firewall exceptions for needed flows.
6. Move one low-risk device group.
7. Add VPN access with the narrowest routes and rules that meet the need.
8. Record the final state, exceptions, and rollback steps in the platform's own vocabulary.

## Firewall rules

Default-deny between zones with named exceptions. A VLAN without rules gives no isolation, because inter-VLAN routing is open until rules block it. Rule order matters: on OPNsense, floating rules are evaluated first, then interface group rules, then interface rules, and a matching "quick" rule (the default) stops evaluation. So allow the narrow exception (for example IoT to the DNS resolver on port 53) above the broader block (IoT to private ranges). Read `references/vlan-and-firewall.md` for the rule pattern, trunk and access ports, and verification.

## DNS filtering

Introduce Pi-hole or AdGuard Home as a dependency with a fallback, not as a single point of failure. Test on one client, then one VLAN, then every DHCP scope. Read `references/pihole-dns.md` for the cutover sequence and Pi-hole v6 notes.

## Remote access

Decide what the VPN may reach before generating keys or opening a port.

| Mode | Use when | Notes |
| --- | --- | --- |
| Split tunnel, one subnet | Remote admin of NAS or lab hosts | Keep the route list narrow |
| Split tunnel, selected services | Specific apps by IP or name | Needs precise firewall rules |
| Full tunnel | Untrusted networks, travel | Home upload becomes the bottleneck; you own DNS for the client |
| Overlay VPN | Simpler access with identity controls | Still needs an ACL review |

Do not recommend port forwarding until the user confirms the VPN endpoint is patched, the forwarded port reaches only the VPN service, public IP and CGNAT status are understood, peers can be revoked individually, and connection status is visible. Read `references/wireguard.md` for the WireGuard specifics.

## Link problems

When a symptom might be physical (loss, flaps, CRC errors, slow uplink), diagnose the link before touching routing or firewall rules. Read `references/interface-health.md`.

## Review checklist

- Each network has a reason to exist and a clear trust boundary.
- No management interface is reachable from guest, IoT, or the internet.
- A DNS failure leaves the operator able to recover locally.
- DHCP changes were tested on one client before broad rollout.
- VPN clients get only the routes and DNS they need.
- Inter-zone rules are default-deny with named exceptions, and no temporary allow-all remains.
- Rollback exists and the operator can still reach gateway, switch, AP, DNS, and VPN admin surfaces.

## Anti-patterns

- Segmenting before knowing which ports and SSIDs carry which VLANs.
- Moving the admin workstation off the only reachable management network.
- Pointing every DHCP scope at a new resolver before testing the fallback.
- Treating VPN access as the same as full LAN access.
- Leaving an ISP router or old AP serving DHCP next to the real gateway.
- Double NAT with no reason or documentation.
- Putting the DNS resolver in the IoT VLAN, where trusted clients need extra rules to reach it.

Adapted from ECC's `homelab-network-readiness`, `homelab-network-setup`, `homelab-pihole-dns`, `homelab-vlan-segmentation`, `homelab-wireguard-vpn` and `network-interface-health` skills (MIT, Copyright (c) 2026 Affaan Mustafa). See `LICENSE` in the plugin root.
