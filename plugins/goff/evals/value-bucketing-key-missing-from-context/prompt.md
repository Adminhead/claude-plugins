---
name: value-bucketing-key-missing-from-context
description: Value case. A flag declares a nested bucketingKey the code never sends. A bare model tends to say evaluation falls back to targetingKey; GOFF skips the rules and returns the SDK default.
tags: [value]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

`checkout-v2` is supposed to be on for half of our companies, but the dashboard shows zero evaluations of the `new` variation and every user still gets the old checkout. The proxy is healthy and the flag file lints clean. The flag in flags/checkout.goff.yaml:

```yaml
checkout-v2:
  bucketingKey: "company.id"
  variations:
    old: false
    new: true
  defaultRule:
    percentage:
      old: 50
      new: 50
```

and the call in our Node API, using the go-feature-flag OpenFeature provider:

```ts
const useNew = await client.getBooleanValue('checkout-v2', false, {
  targetingKey: user.id,
  companyId: user.companyId,
  plan: user.plan,
});
```

A colleague says we should just set `targetingKey` to the company id and leave the flag alone. Is that right? Tell me the cause and the smallest change that fixes it.
