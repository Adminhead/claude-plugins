#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/strings docs
cat > docs/content-style.md <<'J'
# Content style

Rules for every string in the product. They win over anything you remember from other products.

- Sentence case everywhere. No exclamation marks. Never "please" or "sorry".
- Dialog titles are statements, not questions: "You are about to archive this board".
- In a confirmation dialog the confirm button always starts with "Yes, " and then the verb and "it", for example "Yes, move it". The dismiss button is always "Go back". We never use "Cancel" or "OK".
- The body says what happens next in one sentence and, for anything we keep, how long it can be restored: "Archived boards stay in Archive for 30 days."
J
cat > src/strings/en.json <<'J'
{
  "nav": {
    "boards": "Boards",
    "archive": "Archive",
    "settings": "Settings"
  },
  "boardMenu": {
    "rename": "Rename board",
    "duplicate": "Duplicate board",
    "archive": "Archive board"
  },
  "boards": {
    "empty": {
      "title": "No boards yet",
      "body": "Create a board to start planning with your team."
    }
  }
}
J
