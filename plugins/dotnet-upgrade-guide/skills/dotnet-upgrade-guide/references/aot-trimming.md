# Native AOT and trimming readiness

Read when making a project trim- or AOT-compatible, or when IL2xxx/IL3xxx warnings appear after an upgrade. Requires a net8.0+ TFM (multi-targeting with at least one is fine); .NET Framework-only projects have no trim analyzers.

Contents: rules, workflow, fix strategies A-D, polyfills for older TFMs, gotchas, checklist.

## Rules

- Let the build drive the work: build, pick a warning, open that file at that line, fix, rebuild. Don't survey the codebase first.
- Don't hide IL warnings with `#pragma warning disable`: the analyzer goes quiet but the trimmer and ILC still see the problem, and it fails at publish or run time.
- Reserve `[UnconditionalSuppressMessage]` for a case you can prove is safe (the member is preserved some other way), with a `Justification` explaining why. Prefer surfacing the problem with `[RequiresUnreferencedCode]` over hiding it.
- Prefer `[DynamicallyAccessedMembers]` annotations that flow type information through the call chain, then refactors that stop breaking the flow, then `[RequiresUnreferencedCode]` / `[RequiresDynamicCode]` / `[RequiresAssemblyFiles]`, which push the requirement to callers.
- Annotation flow breaks when a `Type` is boxed into `object`, stored in an untyped collection, or passed through an unannotated interface. Fix the flow; don't suppress.

## Workflow

1. Enable the analyzers. For a project that also targets older TFMs, condition it so they don't raise `NETSDK1210`:

   ```xml
   <PropertyGroup>
     <IsAotCompatible Condition="$([MSBuild]::IsTargetFrameworkCompatible('$(TargetFramework)', 'net8.0'))">true</IsAotCompatible>
   </PropertyGroup>
   ```

   `IsAotCompatible` turns on `EnableTrimAnalyzer` and `EnableAotAnalyzer`. For an app (not a library), `PublishAot` or `PublishTrimmed` turns them on too.

2. Build and collect warnings:

   ```bash
   dotnet build path/to/Project.csproj -f net10.0 --no-incremental 2>&1 | grep -oE 'warning IL[0-9]{4}' | sort | uniq -c | sort -rn
   ```

   | Code | Meaning |
   |---|---|
   | IL2026 | Calls a member marked `[RequiresUnreferencedCode]` |
   | IL3050 | Calls a member marked `[RequiresDynamicCode]` |
   | IL2070 | Reflection on a `Type` parameter lacking `[DynamicallyAccessedMembers]` |
   | IL2067 | Passes an unannotated `Type` to an annotated parameter |
   | IL2072 / IL2075 | A return or extracted value flows into reflection without annotation (often after unboxing) |
   | IL2057 | `Type.GetType(string)` with a non-constant argument |
   | IL2091 | Generic argument lacks the annotation its constraint requires |
   | IL2050 | P/Invoke with COM marshalling parameters |
   | IL3000 | `Assembly.Location` is empty in single-file and AOT apps |

3. Triage by count. In most real projects IL2026/IL3050 from `JsonSerializer` dominate: start with strategy C, then handle the rest with A and B, and use D last.
4. Fix innermost first, 5-10 warnings per batch, then rebuild with `--no-incremental`. Annotating an inner method surfaces new warnings in its callers; follow them outward.
5. Build every TFM: 0 IL warnings on net8.0+, no `NETSDK1210`, clean builds on netstandard2.0 or net4x.

Stop when net8.0+ shows 0 IL warnings. After three attempts on one warning, fall back to strategy D. Note warnings that originate in third-party packages instead of chasing them. If a fix needs replacing a whole subsystem (for example a serialization layer), write it up and ask the user before rewriting.

## Strategy A: annotate (preferred)

```csharp
using System.Diagnostics.CodeAnalysis;

void Process([DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicMethods)] Type t)
{
    var method = t.GetMethod("Foo"); // trimmer keeps public methods
}
```

Every caller must now pass an annotated `Type` whose member types are the same as or a superset of the callee's. Requiring `PublicConstructors | NonPublicConstructors` and passing only `NonPublicConstructors` gives IL2091.

## Strategy B: refactor to keep the flow

```csharp
// Broken: Type boxed into object[], annotation lost (IL2072)
void Process(object[] args) { var t = (Type)args[0]; Evaluate(t); }

// Fixed: pass the Type as its own annotated parameter
void Process(object[] args,
    [DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicMethods)] Type calleeType)
    => Evaluate(calleeType);
```

Parameter bags become dedicated parameters; dictionary or list storage becomes an annotated typed field; interface methods get the annotation on their parameter; properties get it on the return.

## Strategy C: source-generated System.Text.Json

1. Find the call sites: `grep -rlE 'JsonSerializer\.(Serialize|Deserialize)' src --include='*.cs'`, and list the types serialized.
2. Create one context covering every type you own. Leave out types from external packages; they won't source-generate (see gotcha 1).

   ```csharp
   [JsonSerializable(typeof(Order))]
   [JsonSerializable(typeof(Customer))]
   internal partial class AppJsonContext : JsonSerializerContext { }
   ```

3. Update each call site with the Edit tool, not `sed` (generic angle brackets and nested parentheses get mangled):
   - `JsonSerializer.Serialize(obj)` -> `JsonSerializer.Serialize(obj, AppJsonContext.Default.Order)`
   - `JsonSerializer.Deserialize<Order>(json)` -> `JsonSerializer.Deserialize(json, AppJsonContext.Default.Order)`
   - ASP.NET Core minimal APIs: register the context with `builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.TypeInfoResolverChain.Insert(0, AppJsonContext.Default))`.
4. Build once; what remains is not serialization.

## Strategy D: `[RequiresUnreferencedCode]` (last resort)

```csharp
[RequiresUnreferencedCode("Loads plugins by name using Assembly.Load")]
public void LoadPlugin(string assemblyName) { var asm = Assembly.Load(assemblyName); }
```

It propagates: callers need the attribute too, so the whole chain is marked trim-incompatible.

## Polyfills for older TFMs

`DynamicallyAccessedMembersAttribute` shipped in .NET 5. The trimmer matches it by name, so netstandard2.0 or net472 targets can carry an internal copy:

```csharp
#if !NET
namespace System.Diagnostics.CodeAnalysis
{
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.ReturnValue | AttributeTargets.GenericParameter |
                    AttributeTargets.Parameter | AttributeTargets.Property | AttributeTargets.Method |
                    AttributeTargets.Class | AttributeTargets.Interface | AttributeTargets.Struct, Inherited = false)]
    internal sealed class DynamicallyAccessedMembersAttribute : Attribute
    {
        public DynamicallyAccessedMembersAttribute(DynamicallyAccessedMemberTypes memberTypes) => MemberTypes = memberTypes;
        public DynamicallyAccessedMemberTypes MemberTypes { get; }
    }

    [Flags]
    internal enum DynamicallyAccessedMemberTypes
    {
        None = 0,
        PublicParameterlessConstructor = 0x0001,
        PublicConstructors = 0x0002 | PublicParameterlessConstructor,
        NonPublicConstructors = 0x0004,
        PublicMethods = 0x0008,
        NonPublicMethods = 0x0010,
        PublicFields = 0x0020,
        NonPublicFields = 0x0040,
        PublicNestedTypes = 0x0080,
        NonPublicNestedTypes = 0x0100,
        PublicProperties = 0x0200,
        NonPublicProperties = 0x0400,
        PublicEvents = 0x0800,
        NonPublicEvents = 0x1000,
        Interfaces = 0x2000,
        All = ~None, // avoid; name the members you need
    }
}
#endif
```

Add `RequiresUnreferencedCodeAttribute` and `UnconditionalSuppressMessageAttribute` the same way if the older TFMs use them, or reference a polyfill package the repo already uses.

## Gotchas

1. External types with no source-generated serializer: if the type implements `IJsonModel<T>` (common in Azure SDK types), call it directly: `((IJsonModel<ResponseError>)value).Write(writer, ModelReaderWriterOptions.Json)`. Otherwise write a `JsonConverter<T>` with `Utf8JsonReader`/`Utf8JsonWriter` and register it through `[JsonSourceGenerationOptions(Converters = ...)]` on the context.
2. `Newtonsoft.Json` and `XmlSerializer` are reflection-based and not AOT-safe. Migrate to System.Text.Json with a context, or mark the call site `[RequiresUnreferencedCode]`.
3. Shared source (`.projitems`, linked files): an annotation changes every consuming project; build them all.

## Checklist

- [ ] `IsAotCompatible` set, conditioned on net8.0+ when multi-targeting
- [ ] Every IL warning fixed by annotation or refactor; no `#pragma` suppressions; any `UnconditionalSuppressMessage` has a justification
- [ ] Polyfills present for older TFMs
- [ ] All TFMs build with 0 IL warnings; shared-source siblings still build

Sources: [Native AOT limitations](https://learn.microsoft.com/dotnet/core/deploying/native-aot/#limitations-of-native-aot-deployment), [Introduction to trim warnings](https://learn.microsoft.com/dotnet/core/deploying/trimming/trimming-concepts), [Fixing trim warnings](https://learn.microsoft.com/dotnet/core/deploying/trimming/fixing-warnings).
