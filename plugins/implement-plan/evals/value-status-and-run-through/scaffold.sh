#!/usr/bin/env bash
set -euo pipefail
mkdir -p docs/plans src tests
cat > docs/plans/slugs.md <<'J'
# Slugs for posts

Approved. Work the slices in order. This folder is not a git repo, so no commits.

## Slices

### 1. slugify
- Write surface: `src/textutil.py` (new file)
- Add `slugify(text)`: lowercase, drop punctuation, collapse runs of spaces and dashes into one `-`.
- Check: `python3 -m unittest tests.test_textutil.TestSlugify`

### 2. unique_slug
- Write surface: `src/textutil.py`
- Depends on slice 1.
- Add `unique_slug(text, taken)`: slugify the text, and if the result is in `taken`, append `-2`, `-3` and so on until it is free.
- Check: `python3 -m unittest tests.test_textutil.TestUniqueSlug`

### 3. use it in create_post
- Write surface: `src/posts.py`
- Depends on slice 2.
- `create_post` must give each post a slug from `unique_slug`, avoiding the slugs already in `posts`.
- Check: `python3 -m unittest tests.test_posts`
J
cat > src/posts.py <<'J'
def create_post(title, posts):
    post = {"title": title, "slug": title.lower().replace(" ", "-")}
    posts.append(post)
    return post
J
cat > tests/__init__.py <<'J'
J
cat > tests/test_textutil.py <<'J'
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from textutil import slugify, unique_slug  # noqa: E402


class TestSlugify(unittest.TestCase):
    def test_punctuation_and_case(self):
        self.assertEqual(slugify("Hello, World!"), "hello-world")

    def test_collapses_runs(self):
        self.assertEqual(slugify("a  --  b"), "a-b")


class TestUniqueSlug(unittest.TestCase):
    def test_free_slug_unchanged(self):
        self.assertEqual(unique_slug("Hello", set()), "hello")

    def test_counts_up(self):
        self.assertEqual(unique_slug("Hello", {"hello", "hello-2"}), "hello-3")
J
cat > tests/test_posts.py <<'J'
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from posts import create_post  # noqa: E402


class TestCreatePost(unittest.TestCase):
    def test_second_post_with_same_title_gets_new_slug(self):
        posts = []
        first = create_post("Hello, World!", posts)
        second = create_post("Hello, World!", posts)
        self.assertEqual(first["slug"], "hello-world")
        self.assertEqual(second["slug"], "hello-world-2")
J
