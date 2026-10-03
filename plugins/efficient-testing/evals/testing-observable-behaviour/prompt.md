---
name: testing-observable-behaviour
description: Quality. Asking to verify a private map should lead to public-API assertions.
tags: [quality]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write tests for this Go cache. I want to verify the internal `items` map is updated correctly after `Set` and after `Delete`.

```go
package cache

type Cache struct {
	mu    sync.Mutex
	items map[string]string
}

func New() *Cache { return &Cache{items: map[string]string{}} }

func (c *Cache) Set(k, v string) { c.mu.Lock(); c.items[k] = v; c.mu.Unlock() }
func (c *Cache) Get(k string) (string, bool) {
	c.mu.Lock(); defer c.mu.Unlock()
	v, ok := c.items[k]
	return v, ok
}
func (c *Cache) Delete(k string) { c.mu.Lock(); delete(c.items, k); c.mu.Unlock() }
func (c *Cache) Len() int { c.mu.Lock(); defer c.mu.Unlock(); return len(c.items) }
```
