---
type: llm
---

Judge only the code the response proposes for the post route and the post page.

PASS only if all of these hold:

1. The route loader and the page component obtain the post through the same query definition (the same key and the same fetch function, for example one shared options object or helper), so one request fills the cache and the component reads it.
2. Opening the post page can trigger at most one network request for that post when the cache is empty, and none when the cache is fresh. A loader that fetches on its own while the component also fetches with its own key does not count.
3. After the title is saved, the code refreshes or updates cached data so that both the post and the posts list show the new title without a page reload. Refreshing only the single post, or only calling a router-level reload that leaves the cached list untouched, does not count.

FAIL otherwise. Do not reward length or extra advice. Ignore formatting, naming and whether TypeScript types are shown.
