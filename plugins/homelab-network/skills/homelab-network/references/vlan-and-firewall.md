# VLAN and firewall rules

Read when drafting VLAN, trunk, and inter-zone rules for a confirmed platform. Commands depend on firmware, so check them against the platform's current docs. OPNsense ordering below comes from docs.opnsense.org/manual/firewall.html. Menu paths for OPNsense, pfSense, UniFi, and MikroTik change between releases, so read them off the live UI instead of from memory.

## Port roles

- Trunk port: carries several tagged VLANs. Use it for switch to router, switch to switch, and switch to AP. The AP maps each SSID to a VLAN, so the trunk allows only the VLANs the AP serves.
- Access port: one untagged VLAN, for end devices (PC, NAS, camera).
- Do not make the native (untagged) VLAN on a trunk the management VLAN. Put management traffic on a tagged VLAN, and use an unused VLAN as native.

## Rule evaluation

On OPNsense:

1. Floating rules, then interface group rules, then interface rules.
2. Inside a group, rules run top to bottom by sequence.
3. A rule with "quick" (the default) ends evaluation on its first match. Without it, the last match wins.
4. Inbound traffic matching no rule is blocked. Traffic leaving the firewall is allowed by default.

Check your platform's own rule for the same questions (processing order, first or last match, implicit deny) before writing rules, since they differ.

## IoT zone pattern

On the IoT interface, in this order:

1. Allow IoT net to the DNS resolver, port 53 TCP and UDP.
2. Allow IoT net to any named local service it needs (for example Home Assistant on its port).
3. Block IoT net to private ranges (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
4. Allow IoT net to any (internet).

The allow rules sit above the private-range block because the block would otherwise also catch the resolver. Guest follows the same shape with only the internet allow. Trusted gets wider access, but not to management unless it is the admin group.

Put the resolver in the Servers zone and allow port 53 from every zone to it.

## Verify after each rule change

- From IoT: ping a trusted device (should fail), resolve a name through the resolver (should work), reach the internet (should work).
- From Guest: the gateway and DNS admin pages are unreachable.
- From Trusted: the management network is reachable only from admin devices.
- Check the DHCP lease and the DNS server the client received.

## Rollback

Keep the exported pre-change config and know how to restore it from the console. For an incremental change, re-enable the old rule or interface, release and renew the client's lease, and retest.
