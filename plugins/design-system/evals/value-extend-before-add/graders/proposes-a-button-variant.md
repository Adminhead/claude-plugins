---
type: regex
pattern: 'variant\s*[=:]?\s*[`"''{(]*(?:destructive|danger|critical)|(?:destructive|danger|critical)[`"'']*\s+variant|(?:new|add(?:ing)?|extend\w*)\s+(?:a\s+)?(?:`?\w+`?\s+)?variant'
flags: i
weight: 1
target: last_message
---
