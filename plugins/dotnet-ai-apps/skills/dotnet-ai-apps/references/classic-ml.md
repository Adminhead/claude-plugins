# Classic ML with ML.NET

Read this when writing code for tabular classification, regression, clustering, anomaly detection, forecasting or recommendation. ML.NET is local, deterministic with a fixed seed, and has no per-call cost.

## Packages

Versions checked on NuGet in October 2026; recheck before writing them.

| Package | Purpose | Version then |
|---|---|---|
| `Microsoft.ML` | `MLContext`, transforms, trainers | 5.0.1 stable (6.0 in preview) |
| `Microsoft.ML.AutoML` | trainer and hyperparameter search | 0.23.1 (still 0.x) |
| `Microsoft.Extensions.ML` | `PredictionEnginePool` for ASP.NET Core | 5.0.1 |
| `Microsoft.ML.FastTree`, `.LightGbm`, `.TimeSeries`, `.Recommender` | extra trainers | match `Microsoft.ML` |

## Guardrails

1. Construct `MLContext` with a fixed seed for reproducible results.
2. Split with `TrainTestSplit` (or cross-validate) and evaluate only on held-out data.
3. Report real metrics: multiclass MicroAccuracy, MacroAccuracy, LogLoss; binary AUC, F1; regression RMSE, R². Compare against a trivial baseline (majority class, mean).
4. Serve with `PredictionEnginePool<TIn, TOut>` in ASP.NET Core. `PredictionEngine` is not thread-safe; never register it as a singleton.
5. Use AutoML (`mlContext.Auto()`) to pick a trainer first when there is no strong prior.
6. Version the saved model `.zip` with the schema of its input class; a changed column breaks loading.

## Minimal shape

```csharp
var ml = new MLContext(seed: 42);

IDataView data = ml.Data.LoadFromTextFile<TicketRow>("tickets.csv", hasHeader: true, separatorChar: ',');
var split = ml.Data.TrainTestSplit(data, testFraction: 0.2);

var pipeline = ml.Transforms.Conversion.MapValueToKey("Label", nameof(TicketRow.Category))
    .Append(ml.Transforms.Text.FeaturizeText("SubjectF", nameof(TicketRow.Subject)))
    .Append(ml.Transforms.Text.FeaturizeText("BodyF", nameof(TicketRow.Body)))
    .Append(ml.Transforms.Concatenate("Features", "SubjectF", "BodyF", nameof(TicketRow.Priority)))
    .Append(ml.MulticlassClassification.Trainers.SdcaMaximumEntropy())
    .Append(ml.Transforms.Conversion.MapKeyToValue("PredictedLabel"));

ITransformer model = pipeline.Fit(split.TrainSet);
var m = ml.MulticlassClassification.Evaluate(model.Transform(split.TestSet));
// log m.MicroAccuracy, m.MacroAccuracy, m.LogLoss

ml.Model.Save(model, data.Schema, "ticket-model.zip");

// ASP.NET Core
builder.Services.AddPredictionEnginePool<TicketRow, TicketPrediction>()
    .FromFile(modelName: "tickets", filePath: "ticket-model.zip", watchForChanges: true);
// inject PredictionEnginePool<TicketRow, TicketPrediction>; pool.Predict("tickets", input)
```

## When asked to use an LLM for this

Redirect to ML.NET and say why: faster, cheaper, reproducible, and measurable with standard metrics. If the user also wants an explanation in plain language, use the hybrid: ML.NET predicts, then an `IChatClient` call explains the prediction and its top features.
