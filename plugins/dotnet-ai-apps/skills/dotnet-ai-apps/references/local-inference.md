# Local inference: ONNX Runtime and Ollama

Read this when running a model inside the app (ONNX Runtime) or against a local model server (Ollama).

## ONNX Runtime

Use when a trained model already exists in ONNX format and the app only does inference. Train or convert outside the app (PyTorch `torch.onnx.export`, `optimum`, `tf2onnx`).

| Package | Use | Version then (Oct 2026) |
|---|---|---|
| `Microsoft.ML.OnnxRuntime` | CPU | 1.31.0 |
| `Microsoft.ML.OnnxRuntime.Gpu` | CUDA, only when the deployment has the matching CUDA and cuDNN | 1.31.0 |
| `Microsoft.ML.OnnxRuntime.DirectML` | Windows GPU | check NuGet |

Guardrails:

1. Validate input and output names, element types and shapes against `session.InputMetadata` / `OutputMetadata` at startup; fail fast on a mismatch.
2. Create one `InferenceSession` in DI and warm it with a dummy run. Never load the model per request; the session is thread-safe for `Run`.
3. Preprocess exactly as at training: same tokenizer (`Microsoft.ML.Tokenizers` for BERT-style and tiktoken vocabularies), normalization and padding.
4. Dispose results (`using var results = session.Run(...)`); they hold native memory.
5. Bound input and batch sizes; measure latency and memory on the deployment hardware.
6. Record the model artifact version together with its preprocessing contract.

```csharp
builder.Services.AddSingleton(_ => new InferenceSession(modelPath, new SessionOptions
{
    GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL,
}));

var input = NamedOnnxValue.CreateFromTensor("input_ids", new DenseTensor<long>(ids, [1, ids.Length]));
using IDisposableReadOnlyCollection<DisposableNamedOnnxValue> results = session.Run([input]);
float[] logits = results.First().AsEnumerable<float>().ToArray();
```

For generative models (small LLMs) in ONNX, `Microsoft.ML.OnnxRuntimeGenAI` handles the token loop; check its current status before choosing it over Ollama.

## Ollama with OllamaSharp

Use for local or offline prompt-response work where privacy, air-gapped operation or cloud cost matters. Same `IChatClient` abstraction as hosted providers, so the rest of the app doesn't change.

| Package | Version then (Oct 2026) |
|---|---|
| `OllamaSharp` | 5.5.0 |
| `Microsoft.Extensions.AI` | 10.11.0 |

`Microsoft.Extensions.AI.Ollama` is deprecated in favor of `OllamaSharp`.

```csharp
builder.Services.AddChatClient(sp =>
{
    var o = sp.GetRequiredService<IOptions<OllamaOptions>>().Value;   // Endpoint, Model from config
    return new OllamaApiClient(new Uri(o.Endpoint), o.Model);
});
// OllamaApiClient also implements IEmbeddingGenerator<string, Embedding<float>> for local embeddings.
```

Guardrails:

1. Keep OllamaSharp behind `IChatClient`; endpoint and model name come from configuration.
2. Set `Temperature` and `MaxOutputTokens`, and bound prompt size to the model's context window and the machine's memory.
3. Use generous timeouts and cancellation: the first call loads the model and can take many seconds.
4. Check the model is pulled before serving (`await client.ListLocalModelsAsync()`), and fail with a clear message naming `ollama pull <model>` if not.
5. Measure latency and memory on the target hardware; local is not free or automatically fast.
6. Tool calling works only with models that support it; check the model card.
