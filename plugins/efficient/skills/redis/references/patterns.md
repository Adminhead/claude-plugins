# Redis patterns

Read this before writing a rate limiter, lock, or stream consumer. Commands are shown in `redis-cli` form so they carry over to any client library. They were run on Valkey 9.1, which is Redis-compatible. Check the "since" version of each command against the target server.

## Fixed-window rate limit

Count requests in a window, and reject once the count passes the limit.

```
MULTI
INCR ratelimit:user:42
EXPIRE ratelimit:user:42 60 NX
EXEC
```

The reply to `INCR` is the count. Reject when it exceeds the limit.

- **Set the expiry only once.** `EXPIRE ... NX` (Redis 7.0 and later) sets a TTL only when the key has none, so the window starts at the first request. If you re-run `EXPIRE` on every `INCR` and the key has no window in its name, each request pushes the expiry out, and a client that never pauses for a full window is rejected forever.
- On older servers, set the TTL only when `INCR` returns 1. That leaves a gap: if the client dies between the two commands, the key never expires. Wrap both in a Lua script, or upgrade.
- If the key name carries the window (`ratelimit:user:42:<window-number>`), re-setting the TTL is harmless but wasteful, and `NX` is still the cleaner form.
- A fixed window allows up to twice the limit across a boundary (a burst at the end of one window and the start of the next). Use a sliding window when that matters.

## Sliding-window rate limit

A sorted set keeps one entry per request, scored by time. Doing the trim, count, and add in one script keeps it atomic. Reading the clock inside the script with `TIME` avoids skew between clients.

```lua
-- KEYS[1] zset key; ARGV[1] window ms; ARGV[2] limit; ARGV[3] unique request id
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
local window = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[2]) then
  redis.call('ZADD', KEYS[1], now, ARGV[3])
  redis.call('PEXPIRE', KEYS[1], window)
  return 1
end
return 0
```

Pass a unique request id as the member (a UUID or a counter), because two requests with the same member would collapse into one entry. Run it with `EVALSHA` or your client's script helper. Memory is proportional to the limit per key, so use fixed windows for very high limits. On Cluster, all keys the script touches must share a hash slot.

## Single-instance lock

Acquire with a random token and an expiry, and release only if the token still matches.

```
SET lock:order:123 <random-token> NX PX 5000
```

`SET` returns OK when acquired and nil when another holder has it. Release with a script, so you can't delete a lock that expired and was taken by someone else:

```lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
```

- Set the TTL longer than the work normally takes, always release in a `finally` block, and don't assume you still hold the lock after the TTL passes.
- **This is an efficiency lock, not a correctness guarantee.** A paused process can outlive its TTL and keep working while another process holds the lock. Replication is asynchronous, so a failover can hand the lock to two clients. The Redis docs recommend fencing tokens for correctness: have the protected resource reject writes carrying an older token than one it already accepted. If the work must never overlap, enforce that in the database (a unique constraint or a row lock) instead.
- Redis docs describe Redlock for multiple independent instances. Read its caveats before choosing it, and use a maintained client library rather than your own implementation.

## Cache stampede lock

Use the same `SET ... NX PX` lock, keyed on the cache key, around the refill:

1. Read the cache. On a hit, return.
2. On a miss, try `SET lock:<key> <token> NX PX <refill-time>`.
3. If you got the lock, rebuild the value, write it with a TTL, and release the lock with the token-checked script.
4. If you didn't, wait briefly and read the cache again, or serve a stale copy, and fall through to the database after a bounded number of tries.

An in-process mutex only protects one process, so it is not a stampede control for a multi-instance service.

## Streams with consumer groups

Streams give at-least-once delivery. A consumer must acknowledge each entry, and entries left unacknowledged stay pending for recovery.

```
XADD events MAXLEN ~ 10000 * type order id 1
XGROUP CREATE events workers 0 MKSTREAM
XREADGROUP GROUP workers consumer-1 COUNT 10 BLOCK 2000 STREAMS events >
XACK events workers <entry-id>
```

- **Create the group once, and treat only one error as benign.** `XGROUP CREATE` returns `BUSYGROUP Consumer Group name already exists` when the group exists. Catch exactly that error and re-raise anything else. A blanket `except: pass` (or an ignored error) hides connection and permission failures.
- Process, then acknowledge. Make processing idempotent, because a crash between the two redelivers the entry.
- **Recover stuck work.** `XPENDING events workers` lists entries delivered but not acknowledged. `XAUTOCLAIM events workers consumer-2 <min-idle-ms> 0-0 COUNT 10` (6.2 and later) transfers entries idle longer than the threshold to a live consumer. Run it periodically, and decide when to dead-letter an entry that keeps failing.
- Cap the stream with `MAXLEN ~ <n>` (approximate trimming is cheaper) or a minimum-ID trim, so it can't grow without bound. Trim past unacknowledged entries only deliberately.
- Use `noeviction` for the instance that holds a stream, or the stream can be evicted.
