#!/usr/bin/env bash
set -euo pipefail
# Seed three Kotlin files of a Room app at version 4 with no migration. No SDK or build needed.
d=app/src/main/java/com/example/data
mkdir -p "$d"
cat > "$d/User.kt" <<'K'
package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "user")
data class User(
    @PrimaryKey val id: Long,
    val name: String,
    val locale: String,
)
K
cat > "$d/AppDatabase.kt" <<'K'
package com.example.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [User::class], version = 4, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao

    companion object {
        fun build(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "app.db").build()
    }
}
K
cat > "$d/UserDao.kt" <<'K'
package com.example.data

import androidx.room.Dao
import androidx.room.Query

@Dao
interface UserDao {
    @Query("SELECT * FROM user")
    suspend fun all(): List<User>
}
K
