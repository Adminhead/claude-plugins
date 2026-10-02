---
name: trigger-golang-1
description: A realistic request that should load efficient:golang.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I need test coverage for this cache type, which lives in cache/cache.go:

```go
package cache

import (
	"sync"
	"time"
)

type entry struct {
	val string
	exp time.Time
}

type Cache struct {
	mu sync.Mutex
	m  map[string]entry
	ttl time.Duration
}

func New(ttl time.Duration) *Cache { return &Cache{m: map[string]entry{}, ttl: ttl} }

func (c *Cache) Set(k, v string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = entry{v, time.Now().Add(c.ttl)}
}

func (c *Cache) Get(k string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[k]
	if !ok || time.Now().After(e.exp) {
		return "", false
	}
	return e.val, true
}
```
