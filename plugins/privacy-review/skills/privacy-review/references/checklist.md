# Privacy review checklist

Read this at step 4 of the review. Each item is a question to answer from code, with the legal anchor where one exists. Regulation: GDPR, Regulation (EU) 2016/679, text at eur-lex.europa.eu. Other regimes (CCPA/CPRA, LGPD, HIPAA for health data) differ in scope and wording, so cite the one the owner says applies. The article numbers below locate the topic; read the article for the requirement.

## Minimization and purpose (GDPR Art. 5(1)(b), (c), Art. 25)

- Does every collected field map to a stated purpose today? Remove or stop collecting what does not.
- Are create, read, and update types separate, so a response cannot return a field the caller does not need?
- Do list and search responses omit sensitive fields by default?
- Is optional collection (analytics, marketing, location) off until the user opts in?
- Is data collected for one purpose reused for another, such as support text sent to model training or ad networks?

## Retention (Art. 5(1)(e))

- Does each table, log stream, cache, queue, and backup holding personal data have an expiry, and does a job enforce it?
- Is the expiry set at schema design time (for example a `expires_at` column or a TTL index) rather than by a manual cleanup?
- Do soft-deleted rows get hard-deleted on a schedule?
- Does an inactive-account policy exist, and is it implemented?

## Erasure and export (Art. 12(3), 15, 17, 20)

- List every store that can hold a person's data: primary database, replicas, caches, search indexes, object storage, analytics warehouse, email and CRM vendors, logs, error reports, and backups.
- Does one erasure path reach each of them, or only the primary table? Check foreign keys and cascades, denormalized copies, and derived data such as embeddings or exports.
- For backups that cannot be edited, is there a documented expiry and a rule that restored data is re-erased?
- Does the export include data from every store, in a structured, commonly used, machine-readable format?
- Does the request path verify the requester's identity, and is each request logged so the response deadline (Art. 12(3)) can be shown?
- Are processors told to erase when the controller erases (Art. 19, Art. 28(3))?

## PII in URLs and logs (Art. 5(1)(c), (f), Art. 32)

- No personal data in URL paths or query strings, which land in CDN, proxy, and browser history logs. Use opaque ids.
- Logs record events and internal ids, not email addresses, tokens, session ids, card numbers, or full request and response bodies.
- IP addresses in logs are truncated or have a retention limit.
- Error responses and stack traces do not echo personal data, and error reporters scrub it before sending.
- Audit logs are separate from application logs, with their own retention and access.

## Third parties (Art. 28, 30, 44 to 49)

- Is each vendor that receives personal data identifiable from the code or config, and does the payload carry only the fields it needs?
- Is there a record of processing activities (Art. 30) that lists the vendor and purpose? Flag a sink that no record could contain.
- Does any call send data to a region outside the one the owner expects? Transfers are an owner and counsel question.

## Access and security (Art. 5(1)(f), Art. 25, 32)

- Is personal data encrypted in transit, and at rest where the store supports it?
- Does every endpoint returning personal data authenticate the caller and check ownership of the record? Hand deeper authorization review to `app-auth`, if installed.
- Are field-level secrets such as tokens or national ids hashed or encrypted, not stored in plain columns?
- Do non-production environments use synthetic or masked data?

## Breach readiness (Art. 33, 34)

- Could the team list which people and fields a single leaked store would expose? The inventory and flow list should answer that.
- Is there a named owner and a way to detect and report an incident inside the notification window Art. 33 sets? Mark as an open question if the repo says nothing.

## High-risk processing (Art. 35)

- Does the feature involve large-scale special-category data, profiling, systematic monitoring, or biometrics? If so, flag that a data protection impact assessment is probably needed and leave the decision to the owner.
