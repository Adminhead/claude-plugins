# Interface health

Read when a host or VLAN shows loss, latency, flaps, or a slow link. The trend matters more than the absolute counter: record a baseline, wait a fixed interval, read again, and compare the increments.

## Commands

Linux hosts:

```bash
ip -s link show <interface>
ethtool <interface>            # speed, duplex, link state
ethtool -S <interface>         # NIC counters
```

Switches and routers use vendor commands such as `show interfaces <interface>`. Check your platform's syntax.

## Counters

| Counter | Meaning | Usual cause |
| --- | --- | --- |
| CRC | Received frame failed checksum | Bad cable, dirty or failing fiber or optic, duplex mismatch |
| Runts | Frames below the minimum size | Duplex mismatch, faulty NIC |
| Giants | Frames above the expected size | MTU mismatch |
| Input drops | Device could not accept inbound packets | Bursts, oversubscription, CPU or queue pressure |
| Output drops | Egress queue discarded packets | Congestion or an undersized uplink |
| Resets | Interface hardware reset | Flapping, driver, optic, power |
| Collisions | Collision counter | Half duplex or negotiation mismatch |

## Diagnosis

CRCs or input errors:

1. Confirm the counters are rising now, not left over from history.
2. Read both ends of the link. Errors on receive usually mean the signal arriving at that port is damaged.
3. Replace the patch cable, or clean or replace the fiber and optic, before changing routing or firewall rules.
4. Confirm speed and duplex agree on both sides.
5. Look for link flaps in the logs at the same time.

Drops:

1. Separate input drops from output drops.
2. Compare traffic rate with link capacity.
3. Check QoS policy and queue counters, and whether the port is an oversubscribed uplink.
4. Prove congestion before tuning queues.

Duplex and speed: use auto-negotiation on both ends when both support it. If one end must be fixed, fix both and note why. A fixed end facing an auto end causes mismatches.

"Internet slow but LAN fine": check WAN interface errors, then LAN uplink output drops, then gateway CPU, and compare wired with Wi-Fi tests before blaming the provider.

## Habits

- Save a baseline before clearing any counter.
- Read both sides of every link under suspicion.
- Use a time window, so old CRCs are not mistaken for a live fault.
