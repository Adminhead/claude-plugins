# Dapper

Contents: Dapper or EF Core, connections, queries, multi-mapping, multiple result sets, dynamic SQL, table-valued parameters, stored procedures, transactions, type handlers, streaming, mixing with EF Core, anti-patterns.

Check the installed Dapper version before using newer APIs (`QueryUnbufferedAsync` and the `DbConnection`-based async overloads come from Dapper 2.x).

## Dapper or EF Core

Choose on need, not on benchmarks from old blog posts: modern EF Core with no-tracking projections is close to Dapper for simple reads.

- Dapper fits hand-written SQL the team wants to own (CTEs, window functions, provider-specific hints), reporting queries, legacy schemas EF maps poorly, and very hot read paths where measurement shows EF overhead.
- EF Core fits aggregates with relationships, change tracking, migrations, and LINQ composition.
- Mixing both in one app is fine; EF's `SqlQuery<T>($"...")` also covers many "just run this SQL into a DTO" cases without a second library.

## Connections

Register a factory that returns `DbConnection` (not `IDbConnection`): async open, async transactions and `QueryUnbufferedAsync` are defined on `DbConnection`.

```csharp
public interface IDbConnectionFactory
{
    DbConnection Create();
}

public sealed class NpgsqlConnectionFactory(IConfiguration config) : IDbConnectionFactory
{
    private readonly string _cs = config.GetConnectionString("App")
        ?? throw new InvalidOperationException("Connection string 'App' is missing.");
    public DbConnection Create() => new NpgsqlConnection(_cs);
}

builder.Services.AddSingleton<IDbConnectionFactory, NpgsqlConnectionFactory>();
```

On .NET 7+ with Npgsql, `NpgsqlDataSource` (`builder.Services.AddNpgsqlDataSource(cs)`, then `dataSource.CreateConnection()`) is the preferred factory. Open one connection per unit of work in a `using`/`await using`; ADO.NET pooling makes that cheap. Don't register a scoped `IDbConnection` that every service shares: it serializes work, leaks across concurrent calls, and hides who opens and closes it. Dapper opens and closes a closed connection around a single call; open it yourself when several calls or a transaction share it.

## Queries

Pass `CommandDefinition` so cancellation and timeouts flow:

```csharp
public async Task<ProductDto?> GetAsync(int id, CancellationToken ct)
{
    await using var conn = _factory.Create();
    return await conn.QuerySingleOrDefaultAsync<ProductDto>(new CommandDefinition(
        "SELECT id, name, price FROM products WHERE id = @Id",
        new { Id = id },
        commandTimeout: 30,
        cancellationToken: ct));
}
```

- Select the columns you map, not `SELECT *`; it keeps mapping stable when columns are added.
- `QuerySingleAsync` throws on zero or many rows, `QueryFirstOrDefaultAsync` takes the first silently; pick the one whose semantics you want.
- Inserts returning keys: `RETURNING id` (PostgreSQL, SQLite), `OUTPUT INSERTED.Id` (SQL Server; avoid `SCOPE_IDENTITY()` with triggers involved), `LAST_INSERT_ID()` (MySQL).
- `ExecuteAsync` with a list parameter runs the statement once per element (a loop, not a bulk insert). For bulk loads use the provider's bulk API (`SqlBulkCopy`, Npgsql binary `COPY`) or a TVP.
- `IN` lists: Dapper expands `WHERE id IN @Ids` for SQL Server and others; on PostgreSQL prefer `WHERE id = ANY(@Ids)` with an array parameter.

## Multi-mapping

```csharp
const string sql = """
    SELECT o.id, o.customer_id, o.total, i.id, i.order_id, i.sku, i.quantity
    FROM orders o
    LEFT JOIN order_items i ON i.order_id = o.id
    WHERE o.id = @OrderId
    """;

var lookup = new Dictionary<int, OrderDto>();
await conn.QueryAsync<OrderDto, OrderItemDto?, OrderDto>(
    new CommandDefinition(sql, new { OrderId = orderId }, cancellationToken: ct),
    (order, item) =>
    {
        if (!lookup.TryGetValue(order.Id, out var existing))
            lookup.Add(order.Id, existing = order with { Items = [] });
        if (item is not null) existing.Items.Add(item);
        return existing;
    },
    splitOn: "id");
return lookup.Values.SingleOrDefault();
```

`splitOn` names the first column of each subsequent type (default `Id`); column order in the SELECT must match the type order. A null child in a LEFT JOIN arrives as `null` only when its split column is null.

## Multiple result sets

```csharp
await using var conn = _factory.Create();
await using var multi = await conn.QueryMultipleAsync(new CommandDefinition("""
    SELECT count(*) FROM products WHERE category_id = @CategoryId;
    SELECT id, name, price FROM products WHERE category_id = @CategoryId
    ORDER BY name, id OFFSET @Offset LIMIT @PageSize;
    """, new { CategoryId = categoryId, Offset = offset, PageSize = pageSize }, cancellationToken: ct));

var total = await multi.ReadSingleAsync<int>();
var page = (await multi.ReadAsync<ProductDto>()).AsList();
```

Read result sets in order. The paging syntax is provider-specific (`OFFSET ... ROWS FETCH NEXT ... ROWS ONLY` on SQL Server).

## Dynamic SQL

Build only the structure from code; every value stays a parameter.

```csharp
var sql = new StringBuilder("SELECT id, name, price FROM products WHERE 1 = 1");
var p = new DynamicParameters();
if (!string.IsNullOrWhiteSpace(term)) { sql.Append(" AND name ILIKE @Term"); p.Add("Term", $"%{term}%"); }
if (categoryId is int c)              { sql.Append(" AND category_id = @CategoryId"); p.Add("CategoryId", c); }

var sortColumn = sort switch { "price" => "price", "name" => "name", _ => "id" };   // whitelist identifiers
sql.Append($" ORDER BY {sortColumn}, id");
```

Never interpolate user input, table names or sort columns into SQL without a whitelist. A generic repository that builds `$"SELECT * FROM {TableName}"` is safe only when `TableName` is a compile-time constant.

## Table-valued parameters (SQL Server)

```csharp
var table = new DataTable();
table.Columns.Add("Id", typeof(int));
foreach (var id in ids) table.Rows.Add(id);

var rows = await conn.QueryAsync<ProductDto>(new CommandDefinition(
    "SELECT p.id, p.name FROM dbo.products p JOIN @Ids i ON i.Id = p.id",
    new { Ids = table.AsTableValuedParameter("dbo.IntIdList") },
    cancellationToken: ct));
// CREATE TYPE dbo.IntIdList AS TABLE (Id int PRIMARY KEY);
```

## Stored procedures and output parameters

```csharp
var p = new DynamicParameters(new { order.CustomerId, order.Total });
p.Add("OrderId", dbType: DbType.Int32, direction: ParameterDirection.Output);
await conn.ExecuteAsync(new CommandDefinition("dbo.CreateOrder", p,
    commandType: CommandType.StoredProcedure, cancellationToken: ct));
var newId = p.Get<int>("OrderId");
```

## Transactions

```csharp
await using var conn = _factory.Create();
await conn.OpenAsync(ct);
await using var tx = await conn.BeginTransactionAsync(ct);

var orderId = await conn.QuerySingleAsync<int>(new CommandDefinition(
    "INSERT INTO orders (customer_id, total) VALUES (@CustomerId, @Total) RETURNING id",
    order, tx, cancellationToken: ct));

await conn.ExecuteAsync(new CommandDefinition(
    "INSERT INTO order_items (order_id, sku, quantity) VALUES (@OrderId, @Sku, @Quantity)",
    items.Select(i => new { OrderId = orderId, i.Sku, i.Quantity }), tx, cancellationToken: ct));

await tx.CommitAsync(ct);   // disposing an uncommitted transaction rolls it back
```

Pass the transaction to every command; a command without it on the same connection fails on most providers.

## Type handlers

```csharp
public sealed class JsonHandler<T> : SqlMapper.TypeHandler<T>
{
    public override T Parse(object value) =>
        JsonSerializer.Deserialize<T>((string)value) ?? throw new DataException($"Null JSON for {typeof(T).Name}");
    public override void SetValue(IDbDataParameter parameter, T? value)
    {
        parameter.Value = JsonSerializer.Serialize(value);
        parameter.DbType = DbType.String;
    }
}

SqlMapper.AddTypeHandler(new JsonHandler<ProductMetadata>());   // once, at startup
```

Handlers are global and static: register them once before first use. `DateOnly`/`TimeOnly` support depends on the Dapper and provider versions; add a handler if mapping fails.

## Streaming large results

```csharp
await using var conn = _factory.Create();
await foreach (var row in conn.QueryUnbufferedAsync<ExportRow>(sql, new { Since = since }).WithCancellation(ct))
    await writer.WriteAsync(row, ct);
```

Unbuffered reads hold the connection and reader open for the whole loop; don't run other commands on that connection meanwhile. `buffered: false` on the sync `Query` gives the same for synchronous code.

## Next to EF Core

- To share a transaction: `var conn = db.Database.GetDbConnection();`, open it through EF (`await db.Database.OpenConnectionAsync(ct)`), start the transaction with `db.Database.BeginTransactionAsync(ct)`, and pass `tx.GetDbTransaction()` to Dapper.
- Dapper writes bypass the change tracker; reload or detach tracked entities affected by them.
- On EF 10 with SQL Server, EF injects an `Application Name` into connection strings without one, so Dapper on the raw string uses a different pool. Set `Application Name` explicitly in the shared string.

## Anti-patterns

| Don't | Do |
|---|---|
| `$"... WHERE name = '{input}'"` | `WHERE name = @Name` with a parameter |
| `new SqlConnection(cs)` without `using` | `await using var conn = ...` |
| One shared scoped `IDbConnection` for all services | A factory and one connection per unit of work |
| `QueryAsync` without a token | `CommandDefinition(..., cancellationToken: ct)` |
| `ExecuteAsync(sql, bigList)` as a "bulk insert" | Provider bulk copy or a TVP |
| Hard-coded pool sizes copied from samples | Provider defaults until measured |
