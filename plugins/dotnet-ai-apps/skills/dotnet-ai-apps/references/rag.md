# RAG, embeddings and ingestion

Read this when writing semantic search or retrieval-augmented answers over documents. There are two halves: ingestion (parse, chunk, embed, store) and query (embed the question, search, ground the answer).

## Packages

Versions checked on NuGet in October 2026; recheck before writing them.

| Package | Purpose | Version then |
|---|---|---|
| `Microsoft.Extensions.AI` (+ provider adapter) | `IEmbeddingGenerator`, `IChatClient` | 10.11.0 |
| `Microsoft.Extensions.VectorData.Abstractions` | MEVD: `VectorStore`, `VectorStoreCollection<TKey, TRecord>`, record attributes, `SearchAsync` | 10.11.0 (usually transitive via a connector) |
| A connector, e.g. `Microsoft.SemanticKernel.Connectors.PgVector`, `.Qdrant`, `.AzureAISearch`, `.SqlServer`, `.InMemory` | the store implementation | 1.74.x, all still `-preview` |
| `Microsoft.Extensions.DataIngestion` (+ readers such as `.MarkItDown`, `.Markdig`) | parse, chunk, embed, upsert pipeline | 10.11.0-preview |

Connector package names and stability move; check https://learn.microsoft.com/dotnet/ai/vector-stores/overview for the current list. Use the store the user named.

## Record and collection

```csharp
public sealed class DocChunk
{
    [VectorStoreKey] public Guid Id { get; set; }
    [VectorStoreData(IsIndexed = true)] public string Source { get; set; } = "";   // file or URL, for attribution
    [VectorStoreData] public string Heading { get; set; } = "";
    [VectorStoreData(IsFullTextIndexed = true)] public string Text { get; set; } = "";
    [VectorStoreVector(1536, DistanceFunction = DistanceFunction.CosineSimilarity)] public ReadOnlyMemory<float> Embedding { get; set; }
}

VectorStoreCollection<Guid, DocChunk> chunks = vectorStore.GetCollection<Guid, DocChunk>("doc_chunks");
await chunks.EnsureCollectionExistsAsync(ct);
```

The vector dimensions must match the embedding model (1536 for `text-embedding-3-small`). Changing the model means re-embedding everything into a new collection.

## Ingestion

1. Parse documents to text that keeps structure (Markdown headings, PDF sections). `Microsoft.Extensions.DataIngestion` readers or your own parser.
2. Chunk on semantic boundaries: split by heading, then paragraph, with a token cap (count with `Microsoft.ML.Tokenizers`) and a small overlap. Don't cut at fixed character counts.
3. Embed in batches: `await embeddings.GenerateAsync(texts, cancellationToken: ct)`.
4. Upsert with a stable key per chunk (hash of source + position) so re-ingesting a changed file replaces its chunks rather than duplicating them: `await chunks.UpsertAsync(records, ct)`.
5. Store the embeddings. Re-embed only changed documents; never re-embed the corpus per query. Cache query embeddings for repeated questions if useful (`.UseDistributedCache()` on the generator builder).

## Query

```csharp
ReadOnlyMemory<float> q = (await embeddings.GenerateAsync([question], cancellationToken: ct))[0].Vector;

var grounded = new List<VectorSearchResult<DocChunk>>();
await foreach (var hit in chunks.SearchAsync(q, top: 5, cancellationToken: ct))
    if (hit.Score >= minScore) grounded.Add(hit);   // minimum relevance; tune per model and distance function

if (grounded.Count == 0) return "I couldn't find that in the documents.";

string context = string.Join("\n\n", grounded.Select((h, i) => $"[{i + 1}] ({h.Record.Source}) {h.Record.Text}"));
ChatResponse answer = await chat.GetResponseAsync(
    [new(ChatRole.System, "Answer only from the numbered sources and cite them like [1]. Say so if they don't contain the answer."),
     new(ChatRole.User, $"Sources:\n{context}\n\nQuestion: {question}")],
    new ChatOptions { Temperature = 0f, MaxOutputTokens = 800 }, ct);
```

- Score meaning depends on the distance function: higher is better for cosine similarity, lower is better for distances. Check the connector's default and set `DistanceFunction` on the vector attribute explicitly.
- Filter by metadata with `new VectorSearchOptions<DocChunk> { Filter = c => c.Source.StartsWith("policies/") }`.
- If the collection was created with an embedding generator configured, `SearchAsync` also accepts the question string directly.
- Hybrid (keyword + vector) search is available on stores that implement `IKeywordHybridSearchable<TRecord>`.

## Guardrails

- Return the source of every chunk used, and show it with the answer.
- Treat retrieved text as untrusted input to the model: documents can contain instructions. Keep the system message in charge and never give a RAG prompt tools with side effects without approval.
- Respect document permissions: filter by the caller's access at query time, not after generation.
- Measure retrieval quality (did the right chunk come back in the top k) on a small labeled question set before tuning prompts.
