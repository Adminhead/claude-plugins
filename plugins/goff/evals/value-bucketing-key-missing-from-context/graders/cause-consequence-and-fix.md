---
type: llm
weight: 3
---

The user runs GO Feature Flag. The flag sets `bucketingKey: "company.id"` (a dotted path to a nested attribute), but the code sends a flat `companyId` and no `company` object. In GO Feature Flag, when the context lacks the bucketingKey attribute the rules are not evaluated and the SDK's own default (`false` here) is returned, so every user gets the old checkout. It does not fall back to hashing on `targetingKey`. Judge the final message.

PASS only if all of these hold:

1. It names the cause as the context not containing the attribute the `bucketingKey` points at: the flag wants a nested `company.id`, the code sends `companyId`.
2. It states the consequence correctly: with the attribute missing, the percentage rule is not evaluated and the caller's default value is returned (which explains why nobody gets `new`). It does not claim that evaluation falls back to `targetingKey`, and it does not blame the percentages.
3. It does not endorse the colleague's suggestion as a fix on its own. Setting `targetingKey` to the company id while the flag still declares `bucketingKey: "company.id"` does not make the attribute appear. (Saying it works only if `bucketingKey` is also removed or the attribute is also sent is acceptable.)
4. It proposes a small change that makes the two sides agree: send `company: { id: user.companyId }` in the context, or change the flag to `bucketingKey: "companyId"`.

FAIL otherwise. Do not reward length.
