# pgvector

Read this when the work involves embeddings, nearest-neighbor queries, or hybrid keyword and vector search. Check that the extension is installed and which version runs (`SELECT extversion FROM pg_extension WHERE extname = 'vector'`), since managed services restrict extensions and lag releases. Claims below come from the pgvector 0.8.7 README and were run on Postgres 18.6.

## Pick an index by size and recall target

| Option | Use when | Trade-off |
| --- | --- | --- |
| No index (exact scan) | Tens of thousands of rows, a selective filter, or recall must be exact | Cost grows with rows scanned |
| HNSW | Default for larger tables | Slower, memory-hungry build. Better speed and recall than IVFFlat. Usable on an empty table |
| IVFFlat | Build time or memory is the constraint | Create it after the table has data. Lower speed and recall than HNSW |

Measure recall against an exact scan on real queries before choosing parameters. Use the same distance operator in the index and the query, and note the dimension limits: `vector` indexes up to 2,000 dimensions and `halfvec` up to 4,000. A `halfvec` column or an expression index on `embedding::halfvec(n)` shrinks storage.

## The operator class must match the query operator

Each index serves one distance function. A mismatch is not an error. The planner silently falls back to a sequential scan, which `EXPLAIN` shows even with `enable_seqscan = off`.

| Distance | Operator | Operator class |
| --- | --- | --- |
| L2 | `<->` | `vector_l2_ops` |
| Inner product (negated) | `<#>` | `vector_ip_ops` |
| Cosine | `<=>` | `vector_cosine_ops` |
| L1 | `<+>` | `vector_l1_ops` |

Use `halfvec_*_ops` for `halfvec`. For unit-length embeddings, inner product is cheapest, and cosine and L2 then rank identically. `<#>` returns the negative inner product, so multiply by -1 to show the real value.

```sql
CREATE INDEX CONCURRENTLY ON chunks USING hnsw (embedding vector_cosine_ops);
-- the query must use the same operator
SELECT id FROM chunks ORDER BY embedding <=> $1 LIMIT 10;
```

## Build and query parameters

- **HNSW build.** `m` (default 16) and `ef_construction` (default 64). Raise them for recall at the cost of build time and insert speed. The build is much faster when the graph fits in `maintenance_work_mem`, so raise it for the build session only, and not past what the server can spare.
- **HNSW query.** `hnsw.ef_search` (default 40) caps the candidate list, so it caps the rows returned. In a test, `ORDER BY embedding <=> $1 LIMIT 100` returned 40 rows until `SET LOCAL hnsw.ef_search = 200`. Set it at least as high as the largest `LIMIT`.
- **IVFFlat.** Start with `lists = rows / 1000` up to 1M rows and `sqrt(rows)` beyond, and `ivfflat.probes = sqrt(lists)`. Higher probes improve recall and cost speed.
- Scope query settings with `SET LOCAL` inside a transaction so they don't leak across pooled connections.
- Build indexes with `CREATE INDEX CONCURRENTLY` in production so writes keep flowing. See the online DDL section in `remedies.md`.

## Filtering shrinks the result

An approximate index scan runs first, then the `WHERE` filter. With `ef_search = 40` and a filter that keeps 10% of rows, about four rows survive. In a test, a filter matching a few rows returned 6 of the 100 requested.

- **Iterative scans (0.8.0 and later).** `SET hnsw.iterative_scan = relaxed_order` (or `strict_order`, and `ivfflat.iterative_scan = relaxed_order`) keeps scanning until enough rows pass the filter, bounded by `hnsw.max_scan_tuples` (default 20,000). The same query then returned all 100 rows. Relaxed order can return rows slightly out of distance order, so re-sort in an outer query when strict order matters.
- **Few distinct filter values.** Use a partial index per value: `... WHERE (category_id = 123)`.
- **Many values, or tenant isolation.** Partition by the filter column (list partitioning) or use separate tables. A shared approximate index lets one tenant's vectors affect another's recall.
- **Exact filter first.** When the filter is very selective, a B-tree on the filter column plus an exact scan can beat the approximate index. Compare plans.

## Keyword search and hybrid ranking

Store a generated `tsvector` with a GIN index, and parse user input with `websearch_to_tsquery`, which accepts raw user text without raising syntax errors.

```sql
CREATE TABLE chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  body text NOT NULL,
  embedding vector(1536) NOT NULL,   -- match the embedding model's dimension
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED
);
CREATE INDEX ON chunks USING gin (tsv);
```

Vector distances and `ts_rank` scores live on unrelated scales, so adding them, even after normalizing, mixes incomparable numbers. Fuse the two rankings by **rank** with Reciprocal Rank Fusion instead: `1 / (k + rank)` per list, summed, with `k = 60` as a common constant. Each candidate list takes its top N through the index, then ranks them.

```sql
-- Run inside a transaction. The tenant filter applies after the index scan, and LIMIT 50
-- exceeds the default ef_search of 40, so raise it and enable iterative scans (0.8.0+).
BEGIN;
SET LOCAL hnsw.ef_search = 100;
SET LOCAL hnsw.iterative_scan = relaxed_order;

-- $1 query embedding, $2 user search text, $3 tenant id: bind them, never interpolate
WITH semantic AS (
  SELECT id, row_number() OVER (ORDER BY dist) AS rank
  FROM (SELECT id, embedding <=> $1 AS dist
        FROM chunks WHERE tenant_id = $3
        ORDER BY embedding <=> $1 LIMIT 50) s
), keyword AS (
  SELECT id, row_number() OVER (ORDER BY score DESC) AS rank
  FROM (SELECT c.id, ts_rank_cd(c.tsv, q) AS score
        FROM chunks c, websearch_to_tsquery('english', $2) q
        WHERE c.tsv @@ q AND c.tenant_id = $3
        ORDER BY score DESC LIMIT 50) k
)
SELECT id,
       coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + k.rank), 0) AS rrf
FROM semantic s FULL OUTER JOIN keyword k USING (id)
ORDER BY rrf DESC
LIMIT 10;
COMMIT;
```

Keep the `ORDER BY embedding <=> $1 LIMIT n` in the innermost query so the planner can use the index, and apply the window function outside it. Pass every value, including metadata filters, as a bound parameter. For a dynamic filter key, check it against an allowlist of column names and bind its value, because building SQL from user-supplied keys with string formatting is an injection hole. When the candidate lists need a better final order, rerank the fused top results with a cross-encoder outside the database.

## Embedding hygiene

- Store the model name and dimension with each vector, and re-embed everything when the model changes, since vectors from different models can't be compared.
- Normalize vectors when the model's metric expects it, and keep one distance function per column.
- Chunk on semantic boundaries (sections, paragraphs) and keep the chunk text and its source key next to the vector so results can be traced and refreshed.
- Embed in batches, and make re-embedding idempotent so a failed run can resume.
