# xUnit v3, NUnit 4 and TUnit

Contents: xUnit v3 (project, fixtures, data, context, MTP), xUnit v2 notes, NUnit 4, TUnit, ASP.NET Core integration tests (WebApplicationFactory, Testcontainers).

Check the resolved package versions first and follow the suite's existing style. Look up current package versions on nuget.org rather than copying numbers from here.

## xUnit v3

Packages: `xunit.v3` (or `xunit.v3.core` without assertions), `xunit.runner.visualstudio` for VSTest. Explicit MTP variants: `xunit.v3.mtp-v1` (3.x only), `xunit.v3.mtp-v2`, `xunit.v3.mtp-off`. MTP v1 is the default in 3.x and v2 in 4.x. A v3 test project is an executable (`<OutputType>Exe</OutputType>`). `<UseMicrosoftTestingPlatformRunner>true</UseMicrosoftTestingPlatformRunner>` swaps the native xUnit command line for the MTP one.

```csharp
public sealed class OrderServiceTests(DatabaseFixture db, ITestOutputHelper output) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task PlaceOrder_PersistsOrder()
    {
        var ct = TestContext.Current.CancellationToken;   // flow it; analyzer xUnit1051 flags missing tokens
        var sut = new OrderService(db.CreateContext());
        var id = await sut.PlaceAsync(new("cust-1", [new("SKU-1", 2)]), ct);
        output.WriteLine($"order {id}");
        Assert.NotEqual(Guid.Empty, id);
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(5, true)]
    public void HasItems_ReflectsCount(int count, bool expected) =>
        Assert.Equal(expected, new Cart(count).HasItems);
}

public sealed class DatabaseFixture : IAsyncLifetime
{
    public ValueTask InitializeAsync() { /* start once per class */ return ValueTask.CompletedTask; }
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    public AppDbContext CreateContext() => throw new NotImplementedException();
}
```

- Shared state: `IClassFixture<T>` (per class), `ICollectionFixture<T>` with `[CollectionDefinition]` (several classes, which then run serially), assembly fixtures with `[assembly: AssemblyFixture(typeof(T))]` (v3).
- `IAsyncLifetime` uses `ValueTask` in v3 and extends `IAsyncDisposable`.
- Data: `[MemberData(nameof(Cases))]` returning `TheoryData<...>` for type safety; `[ClassData(typeof(...))]`.
- Runtime skip: `Assert.Skip("reason")`, `Assert.SkipWhen(cond, "reason")`; explicit-only tests: `[Fact(Explicit = true)]`.
- Classes run in parallel by collection; tests inside one class run serially.
- Filters on MTP: `--filter-class`, `--filter-method`, `--filter-trait`, `--filter-query` (never VSTest `--filter`).

xUnit v2 (`xunit` package) differs: `Task`-returning `IAsyncLifetime`, no `TestContext.Current`, no assembly fixtures, VSTest `--filter` with trait names. Moving v2 to v3 is `dotnet-upgrade-guide` work.

## NUnit 4

Packages: `NUnit`, `NUnit3TestAdapter` (VSTest and the MTP runner via `<EnableNUnitRunner>true</EnableNUnitRunner>`), `NUnit.Analyzers`.

```csharp
[TestFixture]
public sealed class PricingTests
{
    private Pricing _sut = null!;

    [SetUp]
    public void SetUp() => _sut = new Pricing();

    [TestCase(100, 10, 90)]
    [TestCase(50, 0, 50)]
    public void Apply_ReturnsDiscounted(decimal price, int pct, decimal expected) =>
        Assert.That(_sut.Apply(price, pct), Is.EqualTo(expected));

    [Test, CancelAfter(2000)]
    public async Task Fetch_Completes(CancellationToken ct) =>
        Assert.That(await _sut.FetchRatesAsync(ct), Is.Not.Empty);
}
```

- Use the constraint model (`Assert.That(actual, Is.EqualTo(expected))`). NUnit 4 moved the classic asserts (`Assert.AreEqual`, `Assert.IsTrue`) to `ClassicAssert` in `NUnit.Framework.Legacy`; keep them only where the suite already uses them.
- Group assertions with `Assert.Multiple(() => { ... })`, or `using (Assert.EnterMultipleScope()) { ... }` on versions that have it.
- Exceptions: `Assert.That(() => sut.Run(null!), Throws.ArgumentNullException)`; async: `Assert.ThrowsAsync<T>(async () => await ...)`.
- Lifecycle: `[OneTimeSetUp]`/`[OneTimeTearDown]` per fixture, `[SetUpFixture]` per namespace. A fixture instance is shared across its tests by default, so reset fields in `[SetUp]`, or use `[FixtureLifeCycle(LifeCycle.InstancePerTestCase)]`.
- Parallelism is opt-in: `[Parallelizable(ParallelScope.All)]`, `[NonParallelizable]`.
- Data from code: `[TestCaseSource(nameof(Cases))]`, `[ValueSource]`, `[Values]` with `[Combinatorial]`.

## TUnit

MTP only, source-generated, .NET 8+. Package `TUnit` (includes assertions). Tests run in parallel by default; opt out with `[NotInParallel]` (optionally keyed or ordered).

```csharp
public class CalculatorTests
{
    [Before(Test)]
    public void Setup() { /* per test */ }

    [Test]
    [Arguments(1, 1, 2)]
    [Arguments(-1, 1, 0)]
    public async Task Add_ReturnsSum(int a, int b, int expected) =>
        await Assert.That(Calculator.Add(a, b)).IsEqualTo(expected);

    [Test]
    [MethodDataSource(nameof(Cases))]
    public async Task Add_FromMethod(int a, int b, int expected) =>
        await Assert.That(Calculator.Add(a, b)).IsEqualTo(expected);

    public static IEnumerable<(int, int, int)> Cases()
    {
        yield return (2, 3, 5);
    }

    [Test, NotInParallel]
    [Property("Category", "Integration")]
    public async Task WritesSharedFile() { /* ... */ }
}
```

- Every assertion is awaited: `await Assert.That(x).IsNotNull().And.IsEqualTo(y)`. A missing `await` means the assertion never runs.
- Hooks: `[Before(Test|Class|Assembly|TestSession)]` and the matching `[After(...)]`; class and assembly hooks are static.
- Shared resources: `[ClassDataSource<T>(Shared = SharedType.PerTestSession)]` (also `PerClass`, `Keyed`), with `IAsyncInitializer` for async setup.
- Other: `[Repeat(n)]`, `[Retry(n)]`, `[Timeout(ms)]` (take a `CancellationToken` parameter), `[DependsOn(nameof(Other))]`, `[Skip("reason")]`.
- Filter with `--treenode-filter`; with no bridge configured run `dotnet run --project <tests> -- ...`.

## ASP.NET Core integration tests

Package `Microsoft.AspNetCore.Mvc.Testing`. Make the entry point visible: with top-level statements add `public partial class Program;` to `Program.cs` (or reference an assembly marker type).

```csharp
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder("postgres:17-alpine").Build();

    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.AddDbContext<AppDbContext>(o => o.UseNpgsql(_db.GetConnectionString()));
        });

    public async ValueTask InitializeAsync()
    {
        await _db.StartAsync();
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    }

    public override async ValueTask DisposeAsync()
    {
        await _db.DisposeAsync();
        await base.DisposeAsync();
    }
}

public sealed class OrdersApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task GetOrder_Returns404_WhenMissing()
    {
        var client = factory.CreateClient();
        var res = await client.GetAsync($"/api/orders/{Guid.NewGuid()}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
```

- Use the real database engine through Testcontainers (`Testcontainers.PostgreSql`, `Testcontainers.MsSql`, ...; the builder takes the image name). Avoid the EF Core InMemory provider for anything relational: it skips SQL translation, constraints and transactions, so tests pass that production fails. SQLite in-memory is a middle ground only when the app also targets SQLite.
- `ConfigureTestServices` runs after the app's own registrations, so replacements win.
- Replace auth with a test scheme (`AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { })`) rather than disabling authorization.
- Reset data between tests (transaction rollback, Respawn, or a fresh database per class) so tests don't depend on order.
- Testcontainers needs a Docker-compatible daemon; say so when it isn't available instead of switching to InMemory silently.
