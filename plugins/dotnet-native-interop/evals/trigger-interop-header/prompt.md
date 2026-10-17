---
name: trigger-interop-header
description: "Wrapping a C header for C# should load dotnet-native-interop."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I need to call this from our net10.0 service on Linux and Windows x64. Write the C# declarations and a safe wrapper.

```c
// libtiles.h
typedef struct tiles_ctx tiles_ctx;
tiles_ctx* tiles_open(const char* path, unsigned long flags);
int tiles_read(tiles_ctx* ctx, uint8_t* buf, size_t buf_len, size_t* out_read);
const char* tiles_last_error(tiles_ctx* ctx);   /* owned by ctx, do not free */
void tiles_close(tiles_ctx* ctx);
```
