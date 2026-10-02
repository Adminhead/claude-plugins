# Render slurped `gh api graphql --paginate` pages of threads.graphql as compact
# Markdown. Usage: jq -rs -f format.jq

def body_cap: 600;
def reply_cap: 200;
def hunk_lines: 6;

# Input for the author helpers is a comment or review node.
def is_bot: .author.__typename == "Bot" or ((.author.login // "") | endswith("[bot]"));
def login: (.author.login // "ghost") | sub("\\[bot\\]$"; "");
def noise: is_bot and (login | IN("dependabot", "github-actions"));
def handle: "@" + login + (if is_bot then " (bot)" else "" end);

# Drop HTML comments and images, keeping Markdown image alt text. From bots,
# also drop <details> blocks and other tags.
# Keep code fences line by line and collapse whitespace everywhere else.
def clean($bot):
  gsub("<!--[\\s\\S]*?-->"; "")
  | gsub("<picture[\\s\\S]*?</picture>|<img[^>]*>"; ""; "i")
  | gsub("!\\[(?<alt>[^\\]]*)\\]\\([^)]*\\)"; .alt)
  | if $bot then gsub("<details[\\s\\S]*?</details>"; ""; "i") | gsub("<[^>]+>"; "") end
  | [ split("```") | to_entries[]
      | if .key % 2 == 1 then
          "```" + ([.value | split("\n")[] | sub("\\s+$"; "") | select(. != "")] | join("\n")) + "\n```"
        else
          .value | gsub("\\s+"; " ") | trim
        end
      | select(. != "") ]
  | join("\n");

# Cut to $n characters, closing a code fence the cut leaves open.
def cap($n):
  if length <= $n then .
  else .[:$n - 1] | rtrim | . + "…"
    | if (split("```") | length) % 2 == 0 then . + "\n```" end
  end;

def text($n): is_bot as $bot | .body // "" | clean($bot) | cap($n);
def reply: "- \(handle): \(is_bot as $bot | .body // "" | clean($bot) | gsub("\\s+"; " ") | cap(reply_cap))";

def thread($i):
  .comments.nodes[0] as $first
  | (.comments.totalCount - 1) as $replies
  | (.comments.totalCount - (.comments.nodes | length)) as $missing
  | (.line // .originalLine) as $line
  | "### T\($i) \(.path)\(if $line then ":\($line)" else "" end) — \($first | handle)"
    + (if $replies == 1 then " (+1 reply)" elif $replies > 1 then " (+\($replies) replies)" else "" end),
    ($first | text(body_cap)),
    (.comments.nodes[1:][] | select(noise | not) | reply),
    (if $missing > 0 then "- (\($missing) more replies not fetched)" else empty end),
    ($first.diffHunk // "" | rtrim | select(. != "") | "```diff\n" + (split("\n")[-hunk_lines:] | join("\n")) + "\n```");

.[0].data.repository.pullRequest as $pr
| [.[].data.repository.pullRequest.reviewThreads.nodes[]] as $all
| [ $all[]
    | select((.isResolved or .isOutdated or (.comments.nodes | length == 0)) | not)
    | select(.comments.nodes[0] | noise | not) ] as $open
| ($all | map(select(.isResolved)) | length) as $resolved
| ($all | map(select(.isOutdated and (.isResolved | not))) | length) as $outdated

# Bots re-review every push, so keep only each bot's latest summary.
| [ $pr.reviews.nodes[]
    | select(.state | IN("CHANGES_REQUESTED", "COMMENTED"))
    | select(noise | not)
    | {bot: is_bot, login: login, head: "\(handle) (\(.state))", body: text(body_cap)}
    | select(.body != "") ] as $bodies
| [ $bodies | to_entries[]
    | .key as $i | .value | .login as $login
    | select((.bot | not) or all($bodies[$i + 1:][]; .login != $login)) ] as $reviews
| ([if $resolved > 0 then "\($resolved) resolved" else empty end,
    if $outdated > 0 then "\($outdated) outdated" else empty end] | join(", ")) as $hidden
| "PR #\($pr.number): \($pr.title) (\($pr.headRefName) → \($pr.baseRefName))"
  + " — \($open | length) unresolved threads, \($reviews | length) review summaries"
  + (if $hidden != "" then " (\($hidden) hidden)" else "" end),
  (if ($open | length) == 0 then "No unresolved review threads." else empty end),
  ($open | to_entries[] | .key as $k | .value | thread($k + 1)),
  ($reviews | to_entries[] | "### R\(.key + 1) \(.value.head)", .value.body)
