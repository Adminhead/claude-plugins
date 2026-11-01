#!/usr/bin/env bash
set -euo pipefail
# Seed a Kotlin JVM module (no build tool is run): a retrying client that delays between attempts.
mkdir -p src/main/kotlin/acme src/test/kotlin/acme
cat > build.gradle.kts <<'B'
plugins { kotlin("jvm") version "2.4.21" }
repositories { mavenCentral() }
dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
}
tasks.test { useJUnitPlatform() }
B
echo 'rootProject.name = "retry"' > settings.gradle.kts
cat > src/main/kotlin/acme/RetryingClient.kt <<'K'
package acme

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

interface Api {
    suspend fun fetch(): String
}

/** Calls the API, retrying a failed call after a 5 second pause, up to 3 attempts. */
class RetryingClient(private val api: Api) {
    suspend fun fetchWithRetry(): String = withContext(Dispatchers.IO) {
        var last: Exception? = null
        repeat(3) {
            try {
                return@withContext api.fetch()
            } catch (e: Exception) {
                last = e
                delay(5_000)
            }
        }
        throw IllegalStateException("gave up", last)
    }
}
K
