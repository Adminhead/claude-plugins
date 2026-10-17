# Schema conventions and result shapes

Read when writing or reviewing SDL: casing, mutation arguments, connections, or result unions.

## Casing

| Construct | Convention | Example |
| --- | --- | --- |
| Type, interface, union, enum | PascalCase, singular | `User` |
| Field, argument | camelCase | `emailAddress` |
| Enum value | SCREAMING_SNAKE_CASE | `PENDING_PAYMENT` |
| Boolean | `is`/`has`/`can` prefix | `isActive` |
| Collection field | plural noun | `posts` |
| Input type | mutation name + `Input` | `CreateUserInput` |
| Payload or result | mutation name + `Payload` or `Result` | `CreateOrderResult` |

Name fields for what they return (`fullName`, not `getFullName`) and for the client's view, not the legacy API or the data store. Don't repeat the type name inside it (`id`, not `userId`, in `User`).

## Mutation arguments

Keep the selection argument apart from the change data, and make selection non-null:

```graphql
type Mutation {
  collectionUpdate(id: ID!, collection: CollectionInput!): CollectionUpdatePayload!
}
```

A merged input with a nullable `id` leaves it unclear whether `id` is a filter or the target. Either style is fine if applied schema-wide.

## Connections

```graphql
type OrderConnection {
  edges: [OrderEdge!]!
  pageInfo: PageInfo!
}

type OrderEdge {
  cursor: String!
  node: Order!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type Query {
  orders(first: Int, after: String, status: OrderStatus): OrderConnection!
}
```

- Cursors are opaque strings. Encode position (and sort key) so a cursor stays valid while rows are added.
- Use typed sort and filter arguments (`status: OrderStatus`, `orderBy: OrderOrder`), not `filter: JSON`.
- Add `totalCount` only when a cheap count exists, and make it nullable.

## Result unions

```graphql
union CreateOrderResult = CreateOrderSuccess | ValidationError | InsufficientInventory

type CreateOrderSuccess { order: Order! }

interface Error { code: ErrorCode!, message: String! }

type ValidationError implements Error {
  code: ErrorCode!
  message: String!
  fields: [FieldViolation!]!
}
```

- Clients select with `... on CreateOrderSuccess`. Every member should be an object type, since unions can't contain interfaces or scalars.
- For batch mutations return per-item results, so one failure doesn't discard the rest.
- Keep error `message` text free to change and let clients branch on `code`.

## Anti-pattern list

- Hungarian notation or redundant type prefixes.
- Storage details in the schema (`mysql_id`).
- Catch-all shapes such as `getData: JSON` or `options: Options`.
- Mixed casing or mixed mutation-naming order.
- Docstrings that describe internal systems or cron jobs.
