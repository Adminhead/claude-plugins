---
name: csharp-async-deadlock
description: A sync-over-async deadlock in a C# library routes to csharp, not dotnet-performance.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our WPF app freezes when it calls this method from a button click. It's in a shared class library (Contoso.Data/CustomerClient.cs):

```csharp
public Customer GetCustomer(int id)
{
    var response = _http.GetAsync($"customers/{id}").Result;
    response.EnsureSuccessStatusCode();
    return response.Content.ReadFromJsonAsync<Customer>().Result!;
}
```

Why does it hang and how should I rewrite it?
