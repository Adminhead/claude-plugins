# Migration patterns

Three ways to move consumers from an old implementation to a new one. They combine: an adapter behind a feature flag, rolled out strangler-style, is common.

## Strangler

Run old and new side by side and shift traffic in stages. Remove the old system when it serves 0%.

```
Phase 1: new 0%,   old 100%
Phase 2: new 10%   (canary; compare error rates and outputs)
Phase 3: new 50%
Phase 4: new 100%, old idle (keep it deployable for rollback while it bakes)
Phase 5: remove old
```

Fits: services and endpoints behind a router, proxy or load balancer. Watch for Hyrum's law: compare responses (shadow traffic or sampled diffs) before raising the percentage, since consumers depend on quirks the spec never mentions.

## Adapter

Keep the old interface and back it with the new implementation. Consumers change nothing while the backend moves, and you migrate them off the adapter later at their own pace.

```typescript
// Old interface, new implementation
class LegacyTaskService implements OldTaskAPI {
  constructor(private newService: NewTaskService) {}

  getTask(id: number): OldTask {
    const task = this.newService.findById(String(id));
    return this.toOldFormat(task);
  }
}
```

Fits: library and in-process APIs with many call sites. The adapter is itself deprecated code: give it a removal plan, or it becomes zombie code.

## Feature flag per consumer

Switch consumers one at a time with a flag, so each cutover can be reverted without a deploy.

```typescript
function getTaskService(userId: string): TaskService {
  if (featureFlags.isEnabled('new-task-service', { userId })) {
    return new NewTaskService();
  }
  return new LegacyTaskService();
}
```

Fits: risky cutovers, per-tenant rollouts, schema cutovers (switching reads in expand/contract). Delete the flag and the losing branch once the migration is complete; a permanent flag is two systems to maintain.
