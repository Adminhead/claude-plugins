#!/usr/bin/env bash
set -euo pipefail
# Seed a tiny Android module: one screen that loads in the composable body.
mkdir -p app/src/main/java/com/example/profile
cat > app/build.gradle.kts <<'G'
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.example.profile"
    compileSdk = 36
    defaultConfig { minSdk = 26 }
    buildFeatures { compose = true }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
}
G
cat > app/src/main/java/com/example/profile/ProfileScreen.kt <<'K'
package com.example.profile

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun ProfileScreen(vm: ProfileViewModel = viewModel()) {
    var name by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }

    vm.load()
    if (!loaded && vm.profile != null) {
        name = vm.profile!!.name
        loaded = true
    }

    Column {
        if (vm.isLoading) Text("Loading")
        TextField(value = name, onValueChange = { name = it })
        Button(onClick = { vm.save(name) }) { Text("Save") }
    }
}
K
cat > app/src/main/java/com/example/profile/ProfileViewModel.kt <<'K'
package com.example.profile

import androidx.lifecycle.ViewModel

data class Profile(val name: String)

class ProfileViewModel : ViewModel() {
    var profile: Profile? = null
    var isLoading: Boolean = false

    fun load() { /* fetches the profile once per call */ }
    fun save(name: String) { /* persists */ }
}
K
