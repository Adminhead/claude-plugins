# Glossary format

Read this before creating or editing a `GLOSSARY.md` or `GLOSSARY-MAP.md`.

## One context

```markdown
# <Context name>

<One or two sentences on what this context is and why it exists.>

## Language

**Order**:
A request from a customer to buy specific items.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request
```

## Rules

- Pick one word per concept and list the rejected synonyms under `_Avoid_`. A glossary that tolerates synonyms does not settle anything.
- Define what the thing is, in one or two sentences, and leave out what it does.
- Include only terms specific to this context. Ask of each: is this unique to the project, or a general programming idea?
- Group terms under subheadings when clusters appear. A flat list is fine for one cohesive area.

## Several contexts

A `GLOSSARY-MAP.md` at the root lists the contexts and their relationships.

```markdown
# Glossary map

## Contexts

- [Ordering](./src/ordering/GLOSSARY.md): receives and tracks customer orders
- [Billing](./src/billing/GLOSSARY.md): issues invoices and takes payment

## Relationships

- **Ordering to Billing**: Ordering emits `OrderPlaced`; Billing consumes it to create an invoice.
- **Ordering and Billing**: share the `CustomerId` and `Money` types.
```

Each context's `GLOSSARY.md` sits beside the code it describes. System-wide ADRs stay in the root `docs/adr/`, and a context may keep its own `docs/adr/` for local decisions.
