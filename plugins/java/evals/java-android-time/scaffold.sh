#!/usr/bin/env bash
set -euo pipefail
mkdir -p app/src/main/java/com/example/app
cat > settings.gradle.kts <<'J'
rootProject.name = "orders"
include(":app")
J
cat > app/build.gradle.kts <<'J'
plugins {
    id("com.android.application")
}

android {
    namespace = "com.example.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.example.app"
        minSdk = 24
        targetSdk = 35
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
J
cat > app/src/main/java/com/example/app/OrderAge.java <<'J'
package com.example.app;

import java.util.Date;

public final class OrderAge {
    private OrderAge() {}

    /** Whole days between the order date and now. */
    public static long daysOld(Date placed) {
        return (System.currentTimeMillis() - placed.getTime()) / 86_400_000L;
    }
}
J
