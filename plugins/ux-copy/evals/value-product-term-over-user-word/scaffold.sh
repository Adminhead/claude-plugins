#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/strings
cat > src/strings/en.json <<'J'
{
  "nav": {
    "collections": "Collections",
    "recent": "Recently viewed",
    "trash": "Trash"
  },
  "collection": {
    "create": "New collection",
    "rename": "Rename collection",
    "empty": {
      "title": "This collection is empty",
      "body": "Drag items in or use Add item to fill it."
    },
    "delete": {
      "title": "Delete this collection?",
      "body": "Its items move to Trash for 30 days."
    }
  },
  "item": {
    "add": "Add item",
    "move": "Move to another collection"
  },
  "limits": {
    "nameLength": "Names can be up to 80 characters."
  }
}
J
