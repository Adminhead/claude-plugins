---
name: roslyn-analyzers
description: Writes, reviews and tests Roslyn diagnostic analyzers, code fix providers and incremental source generators, including Microsoft.CodeAnalysis version pinning and analyzer NuGet packaging. Use for a DiagnosticAnalyzer, CodeFixProvider or IIncrementalGenerator, an analyzer test harness, or a generator that recomputes on every keystroke.
---

# Roslyn analyzers and source generators

For projects that build analyzers, code fixes or generators (`Microsoft.CodeAnalysis.CSharp` references, `IsRoslynComponent`, `[DiagnosticAnalyzer]`, `[Generator]`).

Not for: fixing analyzer warnings or tuning `.editorconfig` severities in application code (`csharp`), general MSBuild failures (`msbuild`), package versions outside the analyzer boundary (`nuget`).

## Orient

- Read the analyzer, code-fix and test projects: target frameworks, `Directory.Packages.props` (central package management), the test framework, how diagnostic IDs are allocated, localization (`.resx`), release tracking (`AnalyzerReleases.Shipped.md`/`Unshipped.md`), and packaging. Keep established conventions unless they break a rule below.
- Find existing analyzers and their helpers with codebase-memory (`search_graph` for `DiagnosticAnalyzer` subclasses, `trace_path` for callers) when the repo is indexed, else the C# language server (csharp-ls) or Grep.
- Run the narrowest test first, in the repo's runner syntax (VSTest `--filter` vs Microsoft.Testing.Platform options; see `dotnet-testing`).

## Design rules

- **Prefer `IOperation`.** Register the narrowest `OperationKind` and read typed operations (`IInvocationOperation`, `IObjectCreationOperation`, `IConversionOperation`). Order of preference: operation actions, operation-block actions, symbol actions, compilation-start actions that register those, and syntax actions last.
- **Syntax callbacks use the semantic model they are given.** Never call `Compilation.GetSemanticModel` inside a syntax-node callback; that repeats expensive work and usually means an operation action fits better.
- **Resolve symbols once, compare by identity.** In a compilation-start action, resolve types with `Compilation.GetTypeByMetadataName`, then select members from the containing type by name and full signature. If a required type is absent, register no inner action. Compare with `SymbolEqualityComparer.Default.Equals`. When generic substitution doesn't matter, normalize types, properties, fields and events with `OriginalDefinition`, and methods with `(method.ReducedFrom ?? method).OriginalDefinition`; check type arguments separately when they matter.
- **Never identify a symbol by `ToDisplayString()` against a literal.** Display strings vary with aliases, qualification and nullability.
- Keep metadata names and member names in one static catalog class, not scattered literals.
- **Concurrency and state:** call `context.EnableConcurrentExecution()`, make an explicit `ConfigureGeneratedCodeAnalysis(...)` choice, keep callbacks stateless, pass cancellation tokens, and never store compilations, symbols, operations, trees or semantic models in static fields.
- **Separate assemblies.** The analyzer project references only `Microsoft.CodeAnalysis.Common`/`CSharp` (never Workspaces). Code fixes live in their own project with the Workspaces packages.
- **C# first.** VB support only when requested or already established; if promised, test VB separately.
- Test through the public `DiagnosticAnalyzer`/`CodeFixProvider` with the Roslyn test harness, not through `InternalsVisibleTo`.
- **Generators implement `IIncrementalGenerator`**, never `ISourceGenerator` (and don't wrap one with `AsSourceGenerator`). Render output through a small writer such as [assets/SourceWriter.cs](assets/SourceWriter.cs) for deterministic newlines, indentation and encoding.

## Analyzer workflow

1. Write down cases that must report and near-misses that must not. Fix the exact diagnostic span and message arguments before coding.
2. Pick the action kind (see Design rules) and resolve well-known symbols in a compilation-start action.
3. Define a stable ID and `DiagnosticDescriptor` following the repo's category, severity, localization and release-tracking conventions. Give it a `HelpLinkUri` that points at a real published page for that ID.
4. Report the smallest useful location. Skip generated code unless the policy says otherwise.
5. Write the code fix in the code-fix project: find the node from the diagnostic span defensively, preserve trivia and usings, use `SyntaxGenerator` or typed syntax APIs, add `Formatter.Annotation`/`Simplifier.Annotation` where useful, give each action a stable equivalence key, and return `WellKnownFixAllProviders.BatchFixer` only when fixes never conflict.
6. Put positive, negative, edge and code-fix cases in one test class per rule ([references/testing.md](references/testing.md)).
7. Run the focused test class, then the test project, then the repo build. A green build on the newest SDK doesn't prove the analyzer loads in older hosts ([references/packaging-and-versioning.md](references/packaging-and-versioning.md)).

```csharp
// KnownApis is the shared name catalog; HelpLinks builds the published docs URL for an ID.
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class AvoidBlockingAnalyzer : DiagnosticAnalyzer
{
    public const string DiagnosticId = "LIB0001";

    private static readonly DiagnosticDescriptor Rule = new(
        DiagnosticId, "Avoid blocking calls", "Do not call '{0}'", "Usage",
        DiagnosticSeverity.Warning, isEnabledByDefault: true,
        helpLinkUri: HelpLinks.For(DiagnosticId));

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => [Rule];

    public override void Initialize(AnalysisContext context)
    {
        context.EnableConcurrentExecution();
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.RegisterCompilationStartAction(static start =>
        {
            if (start.Compilation.GetTypeByMetadataName(KnownApis.Task.FullName) is not { } taskType)
                return;
            IMethodSymbol? wait = taskType.GetMembers(KnownApis.Task.Wait).OfType<IMethodSymbol>()
                .FirstOrDefault(m => m.Parameters.IsEmpty);
            if (wait is null)
                return;

            start.RegisterOperationAction(ctx =>
            {
                var invocation = (IInvocationOperation)ctx.Operation;
                IMethodSymbol target = (invocation.TargetMethod.ReducedFrom ?? invocation.TargetMethod).OriginalDefinition;
                if (SymbolEqualityComparer.Default.Equals(target, wait))
                    ctx.ReportDiagnostic(Diagnostic.Create(Rule, invocation.Syntax.GetLocation(), target.Name));
            }, OperationKind.Invocation);
        });
    }
}
```

Declare `[DiagnosticAnalyzer(LanguageNames.CSharp, LanguageNames.VisualBasic)]` only when the analysis and locations are truly language-neutral and both languages are tested.

## Source generator workflow

1. Write the generated API you want for sample inputs, plus the diagnostics for invalid input.
2. Discover attribute-driven targets with `SyntaxProvider.ForAttributeWithMetadataName` (Roslyn 4.3.1+); otherwise `CreateSyntaxProvider` with a cheap syntactic predicate and semantic work only in the transform.
3. Transform immediately into small immutable, value-equatable models (records of strings, bools, enums, `EquatableArray`-style collections). Never carry `SyntaxNode`, `ISymbol`, `SemanticModel` or `Compilation` past the transform.
4. Render each model in `RegisterSourceOutput` with the writer; emit stable hint names; report invalid input as diagnostics, never exceptions.
5. Test output, diagnostics, determinism and caching. Pipeline rules and the caching test are in [references/source-generators.md](references/source-generators.md).

## Gotchas

- Analyzer projects target `netstandard2.0` and run inside the compiler host (VS, the SDK's csc, Rider). A newer `Microsoft.CodeAnalysis` or transitive `System.Collections.Immutable`/`System.Reflection.Metadata` than the host ships makes the analyzer fail to load (CS8032), often silently in the IDE.
- `Microsoft.CodeAnalysis.Analyzers` is a development-time package: keep it on the latest version with `PrivateAssets="all"`; it is not part of the pinned host baseline.
- Hosts cache analyzer assemblies by identity. If the assembly version doesn't change per build, VS keeps running the old analyzer.
- `RS1035` and related Microsoft.CodeAnalysis.Analyzers rules flag banned APIs (file I/O, `Environment`) in analyzers and generators: read inputs through `AdditionalTextsProvider` and `AnalyzerConfigOptionsProvider` instead.
- The framework-specific testing packages (`*.Testing.XUnit`, `.NUnit`, `.MSTest`) and `XUnitVerifier` are obsolete; use the generic packages with `DefaultVerifier`.

## References

- [references/testing.md](references/testing.md): test packages, verifier setup, markup syntax, the case checklist; read before writing or fixing analyzer or code-fix tests. Starter verifier: [assets/CSharpCodeFixVerifier.cs](assets/CSharpCodeFixVerifier.cs).
- [references/source-generators.md](references/source-generators.md): incremental pipeline rules, a compact generator, and caching tests; read for any generator work.
- [references/packaging-and-versioning.md](references/packaging-and-versioning.md): Roslyn baseline pinning, dependency-bot rules, unique assembly versions, diagnostic docs and NuGet layout; read when adding packages, bumping Roslyn, or packing.

Adapted from github/awesome-copilot `skills/roslyn-analyzers` (MIT, GitHub, Inc.). See NOTICE.
