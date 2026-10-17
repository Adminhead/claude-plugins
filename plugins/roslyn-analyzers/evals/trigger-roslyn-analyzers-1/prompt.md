---
name: trigger-roslyn-analyzers-1
description: "Writing a new analyzer and code fix loads roslyn-analyzers."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our library ships a small analyzer project (Acme.Analyzers, netstandard2.0). I want a new rule that warns when someone calls `HttpClient.GetAsync` without passing a CancellationToken inside a method that has a CancellationToken parameter, plus a code fix that forwards the token. Here's the existing analyzer for reference:

```csharp
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class AvoidAsyncVoidAnalyzer : DiagnosticAnalyzer
{
    private static readonly DiagnosticDescriptor Rule = new("ACME0001", "Avoid async void", "Method '{0}' is async void", "Usage", DiagnosticSeverity.Warning, true);
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);
    public override void Initialize(AnalysisContext context)
    {
        context.RegisterSyntaxNodeAction(Analyze, SyntaxKind.MethodDeclaration);
    }
    private static void Analyze(SyntaxNodeAnalysisContext ctx)
    {
        var model = ctx.Compilation.GetSemanticModel(ctx.Node.SyntaxTree);
        var symbol = model.GetDeclaredSymbol((MethodDeclarationSyntax)ctx.Node);
        if (symbol is { IsAsync: true, ReturnsVoid: true })
            ctx.ReportDiagnostic(Diagnostic.Create(Rule, ctx.Node.GetLocation(), symbol.Name));
    }
}
```
