import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PREFIX = "mcp__plugin_forgejo-mcp_forgejo__";
const HERE = import.meta.dir;
const PLUGINS = join(HERE, "..", "..");

const KEEP = [
  "get_my_user_info",
  "get_forgejo_mcp_server_version",
  "list_my_repos",
  "get_repo",
  "edit_repo",
  "search_repos",
  "list_repo_topics",
  "set_repo_topics",
  "add_repo_topic",
  "delete_repo_topic",
  "list_branches",
  "create_branch",
  "delete_branch",
  "list_branch_protections",
  "get_branch_protection",
  "create_branch_protection",
  "edit_branch_protection",
  "delete_branch_protection",
  "get_file_content",
  "list_repo_contents",
  "get_repo_tree",
  "create_file",
  "update_file",
  "delete_file",
  "change_files",
  "list_repo_commits",
  "get_commit_statuses",
  "list_repo_issues",
  "search_issues",
  "get_issue_by_index",
  "create_issue",
  "update_issue",
  "issue_state_change",
  "add_issue_labels",
  "remove_issue_labels",
  "list_issue_dependencies",
  "list_issue_dependents",
  "add_issue_dependency",
  "remove_issue_dependency",
  "list_repo_milestones",
  "list_repo_labels",
  "get_repo_label",
  "create_repo_label",
  "edit_repo_label",
  "delete_repo_label",
  "list_org_labels",
  "get_org_label",
  "list_issue_comments",
  "get_issue_comment",
  "create_issue_comment",
  "edit_issue_comment",
  "delete_issue_comment",
  "list_repo_pull_requests",
  "get_pull_request_by_index",
  "create_pull_request",
  "update_pull_request",
  "list_pull_request_files",
  "get_pull_request_diff",
  "merge_pull_request",
  "list_pull_reviews",
  "get_pull_review",
  "list_pull_review_comments",
  "create_pull_review",
  "submit_pull_review",
  "dismiss_pull_review",
  "delete_pull_review",
  "create_review_requests",
  "delete_review_requests",
  "list_releases",
  "get_release_by_id",
  "get_release_by_tag",
  "get_latest_release",
  "create_release",
  "edit_release",
  "delete_release",
  "delete_release_by_tag",
  "list_release_attachments",
  "get_release_attachment",
  "download_release_attachment",
  "create_release_attachment",
  "edit_release_attachment",
  "delete_release_attachment",
  "list_issue_attachments",
  "get_issue_attachment",
  "download_issue_attachment",
  "create_issue_attachment",
  "edit_issue_attachment",
  "delete_issue_attachment",
  "list_comment_attachments",
  "get_comment_attachment",
  "download_comment_attachment",
  "create_comment_attachment",
  "edit_comment_attachment",
  "delete_comment_attachment",
  "dispatch_workflow",
  "list_workflow_runs",
  "get_workflow_run",
  "list_action_run_jobs",
  "get_action_job_logs",
  "cancel_workflow_run",
  "delete_workflow_run",
  "list_action_run_artifacts",
  "get_action_artifact",
];
const DROP = [
  "check_notifications",
  "get_notification_thread",
  "mark_notification_read",
  "mark_all_notifications_read",
  "list_repo_notifications",
  "mark_repo_notifications_read",
  "search_users",
  "list_my_orgs",
  "list_user_orgs",
  "get_org",
  "create_org",
  "edit_org",
  "delete_org",
  "list_org_members",
  "check_org_membership",
  "remove_org_member",
  "create_org_label",
  "edit_org_label",
  "delete_org_label",
  "list_org_teams",
  "search_org_teams",
  "create_org_team",
  "add_team_member",
  "remove_team_member",
  "add_team_repo",
  "remove_team_repo",
  "list_packages",
  "get_package",
  "delete_package",
  "list_package_files",
  "list_repo_hooks",
  "get_repo_hook",
  "create_repo_hook",
  "edit_repo_hook",
  "delete_repo_hook",
  "test_repo_hook",
  "list_wiki_pages",
  "get_wiki_page",
  "get_wiki_revisions",
  "create_wiki_page",
  "update_wiki_page",
  "delete_wiki_page",
  "list_issue_tracked_times",
  "list_repo_tracked_times",
  "list_my_tracked_times",
  "add_issue_time",
  "reset_issue_time",
  "delete_issue_time_entry",
  "start_issue_stopwatch",
  "stop_issue_stopwatch",
  "cancel_issue_stopwatch",
  "list_my_stopwatches",
  "list_repo_action_secrets",
  "create_or_update_repo_action_secret",
  "delete_repo_action_secret",
  "list_org_action_secrets",
  "create_or_update_org_action_secret",
  "delete_org_action_secret",
  "create_repo",
  "fork_repo",
];

const INVENTORY = readFileSync(join(HERE, "tools.txt"), "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "" && !l.startsWith("#"));

function denyList(): string[] {
  const readme = readFileSync(join(HERE, "..", "README.md"), "utf8");
  const section = readme.split(/^## Hide tools you do not need$/m)[1];
  if (!section) throw new Error("README lacks the 'Hide tools you do not need' section");
  const block = /```json\n([\s\S]*?)```/.exec(section);
  if (!block) throw new Error("no json block under the section");
  return JSON.parse(block[1]).permissions.deny;
}

const DENY = denyList();
const PATTERNS = DENY.map((entry) => {
  if (!entry.startsWith(PREFIX)) throw new Error(`deny entry lacks prefix: ${entry}`);
  const glob = entry.slice(PREFIX.length);
  return new RegExp(
    "^" + glob.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$",
  );
});
const denied = (name: string) => PATTERNS.some((re) => re.test(name));

describe("deny rules", () => {
  test("every inventory name is classified exactly once", () => {
    for (const name of INVENTORY) {
      const n = Number(KEEP.includes(name)) + Number(DROP.includes(name));
      expect({ name, n }).toEqual({ name, n: 1 });
    }
    for (const name of [...KEEP, ...DROP]) expect(INVENTORY).toContain(name);
  });

  test("no kept tool is denied", () => {
    expect(KEEP.filter(denied)).toEqual([]);
  });

  test("every dropped tool is denied", () => {
    expect(DROP.filter((n) => !denied(n))).toEqual([]);
  });

  test("tools named by the forgejo skills stay visible", () => {
    const found = new Set<string>();
    for (const f of new Bun.Glob("forgejo-*/skills/**/*.md").scanSync({ cwd: PLUGINS })) {
      const text = readFileSync(join(PLUGINS, f), "utf8");
      for (const m of text.matchAll(/mcp__plugin_forgejo-mcp_forgejo__(\w+)/g)) {
        if (m[1] !== "") found.add(m[1]);
      }
      for (const m of text.matchAll(/`(\w+)`/g)) {
        if (INVENTORY.includes(m[1])) found.add(m[1]);
      }
    }
    expect(found.size).toBeGreaterThan(0);
    expect([...found].filter(denied)).toEqual([]);
    for (const name of [
      "list_workflow_runs", "get_workflow_run", "list_action_run_jobs", "get_action_job_logs",
      "list_repo_pull_requests", "list_pull_reviews", "list_pull_review_comments",
      "list_issue_comments", "create_issue_attachment", "list_repo_labels", "list_org_labels",
    ]) {
      expect(denied(name)).toBe(false);
    }
  });
});
