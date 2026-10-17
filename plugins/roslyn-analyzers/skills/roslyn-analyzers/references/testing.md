# Testing analyzers and code fixes

## Packages

Use the generic `Microsoft.CodeAnalysis.Testing` packages with `DefaultVerifier`:

| Testing | C# package | VB package |
|---|---|---|
| Analyzers | `Microsoft.CodeAnalysis.CSharp.Analyzer.Testing` | `Microsoft.CodeAnalysis.VisualBasic.Analyzer.Testing` |
| Code fixes | `Microsoft.CodeAnalysis.CSharp.CodeFix.Testing` | `Microsoft.CodeAnalysis.VisualBasic.CodeFix.Testing` |
| Refactorings | `Microsoft.CodeAnalysis.CSharp.CodeRefactoring.Testing` | `Microsoft.CodeAnalysis.VisualBasic.CodeRefactoring.Testing` |
| Source generators | `Microsoft.CodeAnalysis.CSharp.SourceGenerators.Testing` | `Microsoft.CodeAnalysis.VisualBasic.SourceGenerators.Testing` |

The `.XUnit`, `.NUnit` and `.MSTest` variants and their `XUnitVerifier`-style types are obsolete. To migrate: drop the suffix from the package and namespace, and replace `AnalyzerVerifier<T>` with `CSharpAnalyzerVerifier<T, DefaultVerifier>` (likewise for the code-fix types).

The test project stays outside the pinned analyzer baseline: it uses the latest repo-approved Roslyn and testing packages, so tests also catch breaks against current compilers.

## Verifier

Keep one test class per diagnostic rule holding both analyzer and code-fix cases. When a rule has no fix, still use the code-fix harness with `EmptyCodeFixProvider` so all cases for the rule live together.

Start from [../assets/CSharpCodeFixVerifier.cs](../assets/CSharpCodeFixVerifier.cs). Rename its namespace. Annotate every helper parameter that takes C# source with `[StringSyntax("c#-test")]` so editors highlight the test code; on a TFM without `StringSyntaxAttribute`, use the repo's polyfill. For local literals, put `/* lang=c#-test */` before the string.

```csharp
using Verify = CSharpCodeFixVerifier<AvoidBlockingAnalyzer, AvoidBlockingCodeFix>;

public class AvoidBlockingTests
{
    [Fact]
    public async Task ReportsWaitAndFixesIt()
    {
        const string source = /* lang=c#-test */ """
            using System.Threading.Tasks;
            class C
            {
                void M(Task task) => [|task.Wait()|];
            }
            """;
        const string fixedSource = /* lang=c#-test */ """
            using System.Threading.Tasks;
            class C
            {
                async Task M(Task task) => await task;
            }
            """;

        await Verify.VerifyCodeFixAsync(source, fixedSource);
    }

    [Fact]
    public async Task DoesNotReportAwait()
    {
        await Verify.VerifyAnalyzerAsync(/* lang=c#-test */ """
            using System.Threading.Tasks;
            class C { async Task M(Task task) => await task; }
            """);
    }
}
```

## Markup

- `[|code|]`: one expected diagnostic from the analyzer's single descriptor.
- `{|#0:code|}` with `Verify.Diagnostic(...).WithLocation(0).WithArguments(...)`: distinct descriptors, arguments or additional locations.
- `{|LIB0001:code|}`: diagnostic by ID inline.
- Hard-coded `WithSpan(line, col, ...)` only where markup can't express the location.

Set `ReferenceAssemblies` explicitly (for example `ReferenceAssemblies.Net.Net80`) instead of copying references from the test runtime, add only the metadata references and additional files a case needs, and pin `LanguageVersion` in parse options when testing version-sensitive syntax.

## Cases to cover

- A plain positive case with the exact span, and a plain negative case.
- Symbol-matching variants that apply: qualified, aliased, generic, inherited, overloaded, extension-method forms.
- Nullability, implicit conversions, conditional access, lambdas, local functions and malformed code, where relevant.
- The referenced type or assembly being absent (the analyzer registers nothing).
- Generated code, per the declared policy.
- Every offered code action and its equivalence key; fix-all when advertised; trivia, usings and formatting preserved.
- C# and VB for every behavior promised in both.

## Running

Run one class first (`dotnet test --filter "FullyQualifiedName~AvoidBlockingTests"` on VSTest; Microsoft.Testing.Platform projects take framework-specific filter options instead). `dotnet-testing` has the platform detection rules and the filter syntax per framework.
