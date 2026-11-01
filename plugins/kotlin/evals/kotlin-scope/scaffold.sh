#!/usr/bin/env bash
set -euo pipefail
# Seed one Kotlin source file whose background work has no owner.
mkdir -p src/main/kotlin/sync
cat > src/main/kotlin/sync/SyncService.kt <<'K'
package sync

import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

interface Api {
    suspend fun push(batch: List<String>)
}

/** Pushes queued items to the server every 30 seconds while the app is open. */
class SyncService(private val api: Api) {
    private val queue = mutableListOf<String>()

    fun enqueue(item: String) {
        queue.add(item)
    }

    @OptIn(DelicateCoroutinesApi::class)
    fun start() {
        GlobalScope.launch {
            while (true) {
                delay(30_000)
                flush()
            }
        }
    }

    fun flush() = runBlocking {
        api.push(queue.toList())
        queue.clear()
    }
}
K
