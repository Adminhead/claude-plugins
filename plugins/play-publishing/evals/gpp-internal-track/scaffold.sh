#!/usr/bin/env bash
set -euo pipefail
# Seed a tiny Android app module with hard-coded signing passwords.
mkdir -p app gradle
cat > settings.gradle.kts <<'S'
rootProject.name = "demo"
include(":app")
S
cat > gradle/libs.versions.toml <<'T'
[versions]
agp = "8.7.0"

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
T
cat > app/build.gradle.kts <<'B'
plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.example.demo"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.example.demo"
        minSdk = 26
        targetSdk = 36
        versionCode = 42
        versionName = "1.4.2"
    }

    signingConfigs {
        create("release") {
            storeFile = file("../upload.jks")
            storePassword = "hunter2-store"
            keyAlias = "upload"
            keyPassword = "hunter2-key"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
B
cat > .gitignore <<'G'
build/
.gradle/
G
