# WireGuard remote access

Read when planning or reviewing a WireGuard setup. Checked against wireguard.com/quickstart and the Cryptokey Routing section of wireguard.com. Server firewall and forwarding rules vary by OS, so derive them from the user's platform instead of copying a snippet.

## Model

Each device has its own keypair. A peer is identified by its public key. `AllowedIPs` does two jobs, as wireguard.com's Cryptokey Routing section says: it is the routing table for traffic going to the peer, and the filter for source addresses accepted from it.

## Keys

- Create private keys with restrictive permissions: `umask 077` before `wg genkey > privatekey`.
- One keypair per device. A shared key means one lost phone forces every device to rekey, and prevents revoking one peer.
- Keep private keys out of git, chat, and logs. To revoke a device, remove its peer block from the server and reload.
- Rotate the server key on a schedule and when exposure is possible, then update every client.

## Split or full tunnel

Set it in the client's peer `AllowedIPs`.

- Split: list only home subnets (for example `<home-subnet-1>, <home-subnet-2>`). Internet traffic goes direct. A destination outside the list will not route, so a "can't reach X" report often means X is missing from `AllowedIPs`.
- Full: `0.0.0.0/0, ::/0` sends all client traffic through home. Set `DNS =` so lookups do not leak, and expect home upload speed to limit the client.
- Give clients `DNS = <resolver-ip>` to use Pi-hole over the tunnel, and allow VPN clients to reach it in the firewall.

## Server checklist

- A VPN subnet that does not overlap any LAN or any network clients visit.
- Server `[Peer]` entries use `/32` addresses for each client, so each peer can only source its own address.
- The listen port (default 51820/UDP) is the only inbound port forwarded, and only to the WireGuard host.
- IP forwarding is enabled and forward rules are scoped to the `wg` interface and the destinations the VPN may reach, not a blanket forward-accept.
- Treat the VPN zone like Trusted or narrower in the firewall.
- Behind CGNAT, no inbound port is possible. Use an overlay VPN or a relay instead.
- A dynamic public IP needs a DNS name that updates. Keep the updater's API token in a root-readable file, not in a compose file.

## Client notes

- Mobile and NATed clients need `PersistentKeepalive = 25` so the NAT mapping stays open (the quickstart calls 25 seconds a sensible interval). It is off by default.
- `wg show` prints the latest handshake. No handshake means the packets are not arriving: check the port forward, the endpoint, the server public key in the client, and the `AllowedIPs` on both sides.
- If the handshake works but nothing routes, check IP forwarding on the server and the firewall rules between the VPN interface and the LAN.

## Review points

- Which routes and DNS does each client get, and does it need more than that?
- Can each peer be revoked on its own?
- Who can see connection status?
