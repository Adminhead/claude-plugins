---
name: trigger-blazor-1
description: "A prerender double-load in a .razor page loads blazor."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My Blazor page (Interactive Server, prerendering on) calls our product API twice on every full page load and the list flickers from "Loading..." to the data. Here's Components/Pages/Products.razor:

```razor
@page "/products"
@rendermode InteractiveServer
@inject ProductService Products

@if (items is null) { <p>Loading...</p> }
else { @foreach (var p in items) { <p>@p.Name</p> } }

@code {
    private List<Product>? items;
    protected override async Task OnInitializedAsync()
    {
        items = await Products.GetAllAsync();
    }
}
```

We're on net10.0. How do I stop the double call?
