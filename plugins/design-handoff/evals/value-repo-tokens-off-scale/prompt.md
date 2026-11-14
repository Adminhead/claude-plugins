---
name: value-repo-tokens-off-scale
description: Value case. Designer numbers for a card, in a repo that already has a token file. Most values sit on the scale, two do not.
tags: [value]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

we're handing the notification card to the dev team tomorrow, can you write up the spec for them? numbers from the designer's file:

- card padding 16, corner radius 6, background #F5F7FA
- title 18px semibold, body 14px, 8px between them
- avatar on the left, then title and body
- two actions under the body: "Mark as read" as a link in #1F6FEB, and "Mute thread"; the gap between the two actions is 10px
- on mobile, swiping the card to the left dismisses it
