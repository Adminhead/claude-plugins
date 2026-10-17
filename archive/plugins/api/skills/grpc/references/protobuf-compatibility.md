# Protobuf compatibility rules

Read when a diff changes messages, fields, enums, `oneof`s, or serialization. Apply it to the encodings and runtimes actually in use.

## Binary-unsafe

Treat these as breaking unless every writer, reader, and stored payload can migrate at once:

- Changing a field number.
- Reusing a deleted or ever-shipped field or enum number. Old binaries, logs, queues, and rollback artifacts may still hold it.
- Moving a field into an existing `oneof`, or out of one.
- Switching between types with different wire encodings, such as `string` and an integer.
- Adding a `required` field (proto2). Older writers can't set it.

## Wire-safe, other dimensions still open

- Adding a field or enum value with a new number.
- Removing a field while reserving its number (and its name where reuse is unsafe).
- Moving one explicit-presence field into a new `oneof`.

These can still break generated code, exhaustive enum switches, validation, business logic, and JSON consumers.

## Parseable but rollout-dependent

These pairs share a wire representation yet can change values or drop data. Prefer a new field. If a migration is unavoidable, keep writers inside the old value domain until every reader upgraded and rollback closed.

| Change | Risk |
| --- | --- |
| `int32`, `uint32`, `int64`, `uint64`, `bool` among each other | Truncation or reinterpretation; bool semantics are the worst |
| `sint32` and `sint64` | Values outside the narrower range change |
| `fixed32` and `sfixed32`, `fixed64` and `sfixed64` | Signedness changes the meaning |
| `string` and `bytes` | Bytes must stay valid UTF-8; generated types change |
| embedded message and `bytes` | Bytes must always hold that message's encoding |
| enum and integer | Unknown-enum handling differs by language |
| singular and repeated (string, bytes, message) | A singular reader keeps the last value or merges messages |
| `map` and its repeated entry message | Entries may reorder and duplicate keys drop |

Cardinality changes are data migrations, not cleanups. Numeric repeated fields are packed by default and don't swap safely with singular ones.

## Replace a shipped field

1. Add a new field with a new number and a distinct name.
2. Deploy readers that understand both.
3. Deploy writers that populate the new field, dual-writing if rollback needs it.
4. Backfill persisted data.
5. Stop using the old field once old binaries and rollback are gone.
6. Remove it and reserve its number and name. Never reserve a number while the field is still declared.

## Presence, defaults, `oneof`

- Moving implicit scalar presence to `optional` is wire-compatible but changes generated accessors and what a default value means. Check merge, patch, equality, and serialization.
- Implicit presence can't tell unset from zero. Use explicit presence or a field mask where zero, empty, or false is meaningful in an update.
- Adding a `oneof` member is parseable, but an old client that sets a known member and reserializes can clear a member it doesn't know. Review read-modify-write paths.
- Removing a `oneof` member loses which member was set. Keep the number.

## Enums

- Keep a `*_UNSPECIFIED` zero value first.
- Adding a value is wire-safe but breaks exhaustive switches. Search consumers.
- Reserve a deleted value's number, and its name where names are contract.

## ProtoJSON and named formats

Review these separately from binary.

- Field and enum names are contract data, so a rename breaks readers.
- ProtoJSON doesn't preserve unknown fields, which narrows forward compatibility, and older parsers may reject new names.
- Changing `json_name`, an integer or string representation, bytes encoding, or `oneof` shape changes the JSON schema.
- HTTP transcoding exposes field and enum names even when the internal transport is binary.
- If JSON is stored anywhere, include historical payloads in the compatibility tests.

## Verification matrix

Run real generated runtimes where languages differ.

| Writer | Reader | Assert |
| --- | --- | --- |
| old | new | Values, presence, enum handling, validation hold |
| new | old | Unknown data tolerated, known values not reinterpreted |
| old | new, edit, serialize, old | Unknown fields survive; known fields not cleared |
| new | old, edit, serialize, new | New fields and `oneof` members not silently lost |

Also test boundary values for any widened or narrowed numeric domain, and round-trip every supported JSON form.

## Sources

protobuf.dev: proto3 guide (updating a message type), best practices (dos and don'ts), ProtoJSON, field presence. buf.build/docs/breaking/rules for rule coverage.
