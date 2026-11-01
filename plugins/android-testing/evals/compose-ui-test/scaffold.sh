#!/usr/bin/env bash
set -euo pipefail
# Seed a tiny Android module: a list screen that loads rows asynchronously and
# a flaky instrumented Compose test that sleeps and asserts copy. No SDK needed.
d=app/src/main/java/com/acme/items
t=app/src/androidTest/java/com/acme/items
mkdir -p "$d" "$t"
cat > settings.gradle.kts <<'S'
rootProject.name = "items"
include(":app")
S
cat > app/build.gradle.kts <<'G'
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.acme.items"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.acme.items"
        minSdk = 26
        targetSdk = 36
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.compose.material3:material3")
    androidTestImplementation(platform("androidx.compose:compose-bom:2026.09.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
G
cat > "$d/ItemListScreen.kt" <<'K'
package com.acme.items

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

/** Stateless list. `items` arrives after a network call; empty means still loading. */
@Composable
fun ItemListScreen(items: List<Item>, onItemClick: (String) -> Unit) {
    Column {
        if (items.isEmpty()) {
            Text("Loading", Modifier.testTag("loading"))
        }
        items.forEach { item ->
            Text(
                text = item.title,
                modifier = Modifier.testTag("row-${item.id}").clickable { onItemClick(item.id) },
            )
        }
    }
}

data class Item(val id: String, val title: String)
K
cat > "$t/ItemListScreenTest.kt" <<'K'
package com.acme.items

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import kotlin.concurrent.thread

class ItemListScreenTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun clickingARowReportsItsId() {
        val items = mutableStateOf(emptyList<Item>())
        var clicked: String? = null
        rule.setContent { ItemListScreen(items.value) { clicked = it } }

        // the repository answers on a background thread after a short delay
        thread {
            Thread.sleep(500)
            items.value = listOf(Item("a1", "First item"), Item("b2", "Second item"))
        }
        Thread.sleep(700)

        rule.onNodeWithText("Second item").performClick()
        Thread.sleep(300)
        assertEquals("b2", clicked)
    }
}
K
