---
type: llm
weight: 3
---

The task: a Gson model (Order, OrderLine in com.acme.shop.model) parses as all nulls only in the minified release build; the fix must keep release minification on.

Judge the files the assistant actually changed (app/proguard-rules.pro, Order.kt) as shown in the transcript.

PASS only if both hold:
1. The models are protected from R8 in a targeted way: a keep rule naming Order and OrderLine (or their package com.acme.shop.model), or `@SerializedName` or `@Keep` annotations on them in the Kotlin source.
2. The fix does not rely on a blanket rule (`-keep class ** { *; }`, a keep of all of com.acme, `-dontobfuscate`, `-dontshrink`, `-dontoptimize`) and does not turn minification off.

FAIL otherwise, including when the assistant only described a fix without writing it to the files. Do not reward length.
