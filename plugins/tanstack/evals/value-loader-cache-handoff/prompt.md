---
name: value-loader-cache-handoff
description: Value case. Duplicate request on route entry and a stale list after an edit; the fix needs the loader and component to share one cache.
tags: [value]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

two problems in our posts app. opening a post fires GET /api/posts/:id twice (once from the route and once from the component), and after I edit a title on the post page and go back to /posts, the list still shows the old title until a hard refresh. Router and Query are both set up already. show me the changed code.

```tsx
// main.tsx
const queryClient = new QueryClient()
const router = createRouter({ routeTree, context: { queryClient } })

// routes/posts/index.tsx
export const Route = createFileRoute('/posts/')({ component: PostList })

function PostList() {
  const { data: posts } = useQuery({ queryKey: ['posts'], queryFn: fetchPosts })
  return <ul>{posts?.map((p) => <li key={p.id}><Link to="/posts/$postId" params={{ postId: p.id }}>{p.title}</Link></li>)}</ul>
}

// routes/posts/$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => fetchPost(params.postId),
  component: PostPage,
})

function PostPage() {
  const { postId } = Route.useParams()
  const { data: post } = useQuery({ queryKey: ['post', postId], queryFn: () => fetchPost(postId) })
  const save = useMutation({ mutationFn: (title: string) => updatePost(postId, title) })
  return <input defaultValue={post?.title} onBlur={(e) => save.mutate(e.target.value)} />
}
```
