---
name: mysql-vs-postgres
description: A MySQL InnoDB deadlock question routes to mysql.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our MySQL 8 InnoDB orders table has intermittent "Deadlock found when trying to get lock; try restarting transaction" errors from two workers that each `SELECT ... FOR UPDATE` a range of rows and then update them. How do I read SHOW ENGINE INNODB STATUS for the cause, and what change would stop it?
