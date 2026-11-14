#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > package.json <<'J'
{
  "name": "todo-app",
  "private": true,
  "dependencies": {
    "@tanstack/react-query": "4.36.1",
    "react": "18.2.0",
    "react-dom": "18.2.0"
  }
}
J
cat > src/api.ts <<'J'
export type Todo = { id: number; title: string }

export async function fetchTodos(page: number): Promise<{ items: Todo[]; hasMore: boolean }> {
  const res = await fetch(`/api/todos?page=${page}`)
  if (!res.ok) throw new Error('failed to load todos')
  return res.json()
}

export async function renameTodo(id: number, title: string): Promise<Todo> {
  const res = await fetch(`/api/todos/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('failed to rename todo')
  return res.json()
}
J
cat > src/TodoList.tsx <<'J'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTodos, renameTodo } from './api'

export function TodoList() {
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['todos', page],
    queryFn: () => fetchTodos(page),
  })

  const rename = useMutation({
    mutationFn: (vars: { id: number; title: string }) => renameTodo(vars.id, vars.title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
  })

  if (isLoading) return <p>Loading</p>

  return (
    <div>
      <ul>
        {data?.items.map((todo) => (
          <li key={todo.id}>
            {todo.title}
            <button onClick={() => rename.mutate({ id: todo.id, title: `${todo.title} (done)` })}>
              Rename
            </button>
          </li>
        ))}
      </ul>
      <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
      <button disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>Next</button>
    </div>
  )
}
J
