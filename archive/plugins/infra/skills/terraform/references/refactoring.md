# Import, moved, and removed

Read when renaming or moving resources, importing existing infrastructure, or ending Terraform's management of a resource. All three blocks are planned like any change, so review them in the plan before they run.

## moved

Tells Terraform that an object at an old address now lives at a new one, so it renames state instead of destroying and recreating.

```hcl
moved {
  from = aws_instance.a
  to   = aws_instance.b
}
```

Use it for:

- renaming a resource,
- moving a resource into or out of a module,
- converting `count` to `for_each` (one block per instance, for example `from = aws_subnet.private[0]`, `to = aws_subnet.private["a"]`),
- renaming a module call.

Check the plan reads "has moved to" for each instance and shows no destroy. Leave `moved` blocks in place while any environment or consumer of a shared module may still hold state at the old address, and remove them only once every state has applied.

## import

Brings an existing object under management. Write the block and the matching `resource` block, then plan.

```hcl
import {
  to = aws_s3_bucket.logs
  id = "<existing-bucket-name>"
}
```

- `id` is the provider's import ID (look it up in the resource's docs page, "Import" section). Some providers accept an `identity` object instead.
- `for_each` on an `import` block imports many objects from a map or set.
- `terraform plan -generate-config-out=generated.tf` drafts a `resource` block from the live object. It has been experimental since Terraform 1.5, the target file must not exist, and the output can contain conflicting arguments that you resolve by hand. Treat it as a first draft, edit it, and delete read-only and defaulted attributes.
- After the import plan shows only "import" with no further changes, the config matches reality. If the plan proposes changes, decide whether the config or the object should win before anything is applied.
- The older `terraform import` command writes state immediately with no plan, so prefer the block.

## removed

Stops managing a resource without editing it out of existence by accident. Deleting a `resource` block plans a destroy, so use `removed` when the object must survive.

```hcl
removed {
  from = aws_instance.example

  lifecycle {
    destroy = false
  }
}
```

- `destroy = false` drops the object from state and leaves it running, for a handoff to another tool or team.
- Without `destroy = false`, the default is to destroy the real object. Set it explicitly either way so the intent is visible in review.

## Order of operations for a refactor

1. Make the code change and add the `moved`, `import`, or `removed` blocks in the same commit.
2. `terraform plan -out=tfplan`. The plan must show zero destroys for moves and imports.
3. Repeat the plan against every environment that shares the code, because each has its own state.
4. After all states apply, prune obsolete `moved` blocks.
