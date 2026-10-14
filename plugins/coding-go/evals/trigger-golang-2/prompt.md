---
name: trigger-golang-2
description: A realistic request that should load coding-go:golang.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

`go test -race ./...` reports a data race in my worker pool and the service sometimes hangs on shutdown. Here is the relevant code from pool/pool.go:

```go
func (p *Pool) Run(ctx context.Context) {
	for i := 0; i < p.n; i++ {
		go func() {
			for job := range p.jobs {
				p.results = append(p.results, job.Do())
			}
		}()
	}
	<-ctx.Done()
}
```

What is wrong here and how should I fix it?
