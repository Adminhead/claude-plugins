# Secret references

Read before building a `pass://` URI, choosing a field, or handling TOTP.

## Form

```text
pass://<vault>/<item>/<field>
```

- The vault is a Share ID or name. The item is an item ID or title. The field is a standard, custom, or section-qualified field name.
- Prefer Share ID plus item ID. Duplicate names can resolve unpredictably.
- Quote the whole URI in the shell: `REF="pass://$SHARE_ID/$ITEM_ID/$FIELD"`.
- Names with spaces work. Proton doesn't document escaping for separator characters, so use IDs instead of guessing.

## Find IDs and field names without values

```bash
pass-cli vault list --output json | jq '.vaults[] | {name, share_id}'
pass-cli item list --share-id "$SHARE_ID" --output json | jq '.items[] | {id, title, item_type}'
pass-cli item view --share-id "$SHARE_ID" --item-id "$ITEM_ID" --output json \
  | jq '[paths(scalars) | map(tostring) | join(".")]'
```

The last command lists field paths only, such as `item.content.content.Login.password`. Never run `item view` without that jq filter to find a field, and never use `item list --show-secrets` to locate an item.

Common login fields are `username`, `password`, `email`, `url`, `note`, and `totp`. Custom field names work too. Match the exact spelling and case shown, since Proton's docs contradict each other on case sensitivity.

## Sections and TOTP

- For duplicate field names across named sections, qualify as `SectionName.fieldname`, for example `Production.password`. An unqualified name may pick the first match.
- A `totp` reference resolves to the current code. Request the underlying `otpauth://` URI with `?totp=uri` only when explicitly required.
- Always give `run` and `inject` a field-qualified URI, never an item-level one.

## Sources

- [Secret references](https://protonpass.github.io/pass-cli/commands/contents/secret-references/)
- [Item command](https://protonpass.github.io/pass-cli/commands/item/)
- [Item object](https://protonpass.github.io/pass-cli/objects/item/)
