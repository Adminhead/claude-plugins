---
name: trigger-template-missing
description: "A template missing after dotnet new install should load dotnet-template-authoring."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I ran `dotnet new install ./templates/api` and it says success, but `dotnet new myapi` doesn't work and my parameters don't show up. Here's .template.config/template.json:

```json
{
  "identity": "Contoso Api Template",
  "name": "Contoso API",
  "shortName": "list",
  "symbols": {
    "auth": { "type": "parameter", "datatype": "choice", "defaultValue": "Jwt" },
    "authMode": { "type": "parameter", "datatype": "boolean" }
  }
}
```
