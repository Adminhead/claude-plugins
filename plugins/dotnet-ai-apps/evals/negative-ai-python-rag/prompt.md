---
name: negative-ai-python-rag
description: "A Python RAG pipeline is not a .NET AI app."
tags: [negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Build a RAG pipeline in Python with LangChain and pgvector over our Markdown docs folder, with source citations in the answers.
