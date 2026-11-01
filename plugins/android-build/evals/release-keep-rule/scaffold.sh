#!/usr/bin/env bash
set -euo pipefail
# Seed the relevant files of an Android app module (text only; no SDK needed).
mkdir -p app/src/main/java/com/acme/shop/model
cat > app/build.gradle.kts <<'P'
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.acme.shop"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.acme.shop"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

dependencies {
    implementation(libs.gson)
    implementation(libs.retrofit.converter.gson)
}
P
: > app/proguard-rules.pro
cat > app/src/main/java/com/acme/shop/model/Order.kt <<'P'
package com.acme.shop.model

data class Order(
    val orderId: String,
    val totalCents: Long,
    val lines: List<OrderLine>,
)

data class OrderLine(val sku: String, val quantity: Int)
P
cat > crash.txt <<'P'
FATAL EXCEPTION: main
java.lang.NullPointerException: Attempt to read from field 'java.lang.String a.a.a' on a null object reference
  at com.acme.shop.a.b.c(SourceFile:12)
Release build only. Debug works. The Order JSON parsed by Gson comes back with every field null.
P
