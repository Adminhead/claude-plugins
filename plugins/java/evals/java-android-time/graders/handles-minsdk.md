---
type: llm
weight: 2
---
The module is an Android application with `minSdk = 24` and no core library desugaring. `java.time` is only available from API 26. Pass only if the response either enables core library desugaring (`isCoreLibraryDesugaringEnabled = true` plus a `coreLibraryDesugaring` dependency on `desugar_jdk_libs`) in `app/build.gradle.kts`, or tells the user that this change needs it or a `minSdk` of 26 or higher, or keeps the code off `java.time` and explains why. Fail if it uses `java.time` and says nothing about `minSdk` or desugaring.
