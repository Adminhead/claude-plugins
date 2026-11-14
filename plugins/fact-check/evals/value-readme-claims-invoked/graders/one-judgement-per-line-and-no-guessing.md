---
type: llm
---

Facts the agent could find in the repo: the exit-status line is true (the CLI returns 3 when no files need moving); the Python line and the file-cap line are wrong; no file in the repo measures scan speed.

PASS only if all of these hold:

1. Each of the four README lines gets its own explicit judgement in the response.
2. The exit-status line is judged correct, with the file it was found in named (not "this sounds right").
3. The speed line is not declared true or false. The response says nothing in the repo supports it (no benchmark, test or log) and does not estimate or vouch for the number from general knowledge. Saying "plausible" without saying it is unsupported fails.
4. Where a line is wrong, the response gives the right value and names the file it came from.

FAIL otherwise. Do not reward length or formatting.
