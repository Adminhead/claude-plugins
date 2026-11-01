#!/usr/bin/env bash
set -euo pipefail
# Seed a tiny single-module Android project (text files only; no SDK needed).
mkdir -p app/src/main/java/com/example/notes gradle
cat > settings.gradle.kts <<'P'
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "notes"
include(":app")
P
cat > build.gradle.kts <<'P'
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
}
P
cat > gradle/libs.versions.toml <<'P'
[versions]
agp = "9.5.0"
kotlin = "2.4.21"

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
P
cat > app/build.gradle.kts <<'P'
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.example.notes"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.example.notes"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
}
P
cat > app/src/main/AndroidManifest.xml <<'P'
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="Notes">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
P
cat > app/src/main/java/com/example/notes/MainActivity.kt <<'P'
package com.example.notes

import android.app.Activity
import android.os.Bundle

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }
}
P
