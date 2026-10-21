"""Tests for necromancy.py. All transcripts are synthetic and built in a temp dir."""
import contextlib
import io
import json
import os
import stat
import sys
import tempfile
import time
import unittest
from unittest import mock

# `python3 -I` drops the script directory from sys.path, so add it explicitly.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import necromancy as n  # noqa: E402

PROJECT = "/work/Demo_App"
SLUG = "-work-Demo-App"


def user(text, **kw):
    return {"type": "user", "turnOrigin": "human", "message": {"role": "user", "content": text}, **kw}


def assistant(*blocks, **kw):
    return {"type": "assistant", "message": {"role": "assistant", "content": list(blocks)}, **kw}


def tool_use(tid, name, **inp):
    return {"type": "tool_use", "id": tid, "name": name, "input": inp}


def tool_result(tid, text="ok", is_error=False, **top):
    rec = {
        "type": "user",
        "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": tid, "content": text, "is_error": is_error}]},
    }
    rec.update(top)
    return rec


def text(s):
    return {"type": "text", "text": s}


class Store(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cfg = os.path.join(self.tmp.name, "cfg")
        env = mock.patch.dict(os.environ, {"CLAUDE_CONFIG_DIR": self.cfg})
        env.start()
        self.addCleanup(env.stop)

    def write(self, sid, records, slug=SLUG, age=3600, raw_lines=()):
        d = os.path.join(self.cfg, "projects", slug)
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, sid + ".jsonl")
        with open(path, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")
            for r in raw_lines:
                f.write(r + "\n")
        t = time.time() - age
        os.utime(path, (t, t))
        return path

    def digest(self, records, **kw):
        path = self.write("aaaaaaaa-0000", records, **kw)
        s = n.Session(path)
        return n.digest_text(s)

    def run_cli(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        code = 0
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                code = n.main(list(argv))
            except SystemExit as e:
                code = e.code
        return code, out.getvalue(), err.getvalue()


class TestStore(Store):
    def test_slug_replaces_non_alphanumerics(self):
        self.assertEqual(n.slug(PROJECT), SLUG)

    def test_config_dir_env_moves_the_tree(self):
        self.write("s1", [user("hi")])
        self.assertEqual(len(n.session_files(PROJECT)), 1)
        with mock.patch.dict(os.environ, {"CLAUDE_CONFIG_DIR": os.path.join(self.tmp.name, "elsewhere")}):
            self.assertEqual(n.session_files(PROJECT), [])

    def test_slug_case_insensitive_and_worktrees(self):
        self.write("s1", [user("a")], slug=SLUG.lower())
        self.write("s2", [user("b")], slug=SLUG + "--claude-worktrees-feat")
        self.write("s3", [user("c")], slug=SLUG + "-other")
        ids = sorted(f[1] for f in n.session_files(PROJECT))
        self.assertEqual(ids, ["s1", "s2"])

    def test_list_ordering_and_live_flag(self):
        self.write("old", [user("old ask")], age=7200)
        self.write("new", [user("new ask")], age=10)
        self.write("mid", [user("mid ask")], age=600)
        code, out, _ = self.run_cli("list", "--project", PROJECT)
        self.assertEqual(code, 0)
        lines = out.splitlines()
        self.assertEqual([ln.split()[0] for ln in lines], ["new", "mid", "old"])
        self.assertIn(" live? ", lines[0])
        self.assertNotIn("live?", lines[1])

    def test_list_max_and_exclude(self):
        for i in range(5):
            self.write(f"s{i}", [user("x")], age=100 * (i + 1))
        _, out, _ = self.run_cli("list", "--project", PROJECT, "--max", "2", "--exclude", "s0")
        self.assertEqual([ln.split()[0] for ln in out.splitlines()], ["s1", "s2"])

    def test_title_precedence_and_last_record_wins(self):
        recs = [
            {"type": "agent-name", "agentName": "agent"},
            {"type": "ai-title", "aiTitle": "ai one"},
            {"type": "ai-title", "aiTitle": "ai two"},
        ]
        s = n.Session(self.write("s1", recs))
        self.assertEqual(s.title(), "ai two")
        recs.append({"type": "custom-title", "customTitle": "mine"})
        s = n.Session(self.write("s1", recs))
        self.assertEqual(s.title(), "mine")
        s = n.Session(self.write("s1", [{"type": "agent-name", "agentName": "agent"}]))
        self.assertEqual(s.title(), "agent")

    def test_list_reports_handoff_file(self):
        recs = [
            user("go"),
            assistant(tool_use("w1", "Write", file_path="/tmp/handoff-abc123.md", content="x")),
            assistant(tool_use("b1", "Bash", command='mktemp "${TMPDIR:-/tmp}/handoff-XXXXXX.md"')),
            tool_result("b1", "/tmp/handoff-zzz999.md\n"),
        ]
        s = n.Session(self.write("s1", recs))
        self.assertEqual(s.handoffs, ["/tmp/handoff-abc123.md", "/tmp/handoff-zzz999.md"])
        self.assertIn("handoff=/tmp/handoff-zzz999.md(gone)", n.list_line(s, time.time()))

    def test_compaction_count(self):
        recs = [{"type": "system", "subtype": "compact_boundary"}] * 2 + [{"type": "system", "subtype": "turn_duration"}]
        self.assertEqual(n.Session(self.write("s1", recs)).compactions, 2)


class TestParser(Store):
    def test_first_request_skips_meta_notification_and_sidechain(self):
        recs = [
            user("meta text", isMeta=True),
            user("<task-notification>done</task-notification>", turnOrigin="task_notification"),
            user("side ask", isSidechain=True),
            user("real first ask"),
            user("second ask"),
        ]
        s = n.Session(self.write("s1", recs))
        self.assertEqual(s.prompts, ["real first ask", "second ask"])

    def test_human_detection_fallbacks(self):
        recs = [
            {"type": "user", "promptSource": "typed", "message": {"content": "typed one"}},
            {"type": "user", "promptSource": "queued", "message": {"content": "queued one"}},
            {"type": "user", "message": {"content": "bare string"}},
            {"type": "user", "message": {"content": "<local-command-stdout>x</local-command-stdout>"}},
        ]
        s = n.Session(self.write("s1", recs))
        self.assertEqual(s.prompts, ["typed one", "bare string"])

    def test_slash_command_rendering(self):
        body = "<command-name>/review</command-name><command-args>the diff</command-args>"
        s = n.Session(self.write("s1", [user(body), user("<command-name>/clear</command-name>")]))
        self.assertEqual(s.prompts, ["/review the diff", "/clear"])

    def test_ask_user_question_answers(self):
        recs = [tool_result("q1", toolUseResult={"answers": {"Which db?": "postgres"}})]
        text_, counts = self.digest(recs)
        self.assertIn("answer: Which db? -> postgres", text_)

    def test_user_rejected_denials(self):
        recs = [
            assistant(tool_use("t1", "Bash", command="rm -rf build")),
            tool_result("t1", "rejected", toolDenialKind="user-rejected"),
            assistant(tool_use("t2", "Bash", command="ls")),
            tool_result("t2", "nope", toolDenialKind="permission-rule"),
        ]
        text_, _ = self.digest(recs)
        self.assertIn("rejected: Bash: rm -rf build", text_)
        self.assertNotIn("rejected: Bash: ls", text_)

    def test_compact_summary_in_its_own_section(self):
        recs = [
            {"type": "user", "isCompactSummary": True, "message": {"content": "Summary line one\nline two"}},
            user("typed after"),
        ]
        s = n.Session(self.write("s1", recs))
        self.assertEqual(s.prompts, ["typed after"])
        text_, counts = n.digest_text(s)
        self.assertIn("> Summary line one", text_)
        self.assertEqual(counts["Latest compact summary"], 1)

    def test_task_status_open_first(self):
        recs = [
            assistant(tool_use("c1", "TaskCreate", subject="Write parser")),
            tool_result("c1", "Task #1 created successfully"),
            assistant(tool_use("c2", "TaskCreate", subject="Write tests")),
            tool_result("c2", "Task #2 created successfully"),
            assistant(tool_use("u1", "TaskUpdate", taskId="1", status="completed")),
            tool_result("u1", "updated"),
        ]
        text_, _ = self.digest(recs)
        tasks = text_.split("## Tasks")[1].split("##")[0]
        self.assertLess(tasks.index("[pending] Write tests"), tasks.index("[completed] Write parser"))

    def test_files_written_with_counts(self):
        recs = [
            assistant(tool_use("e1", "Edit", file_path="/p/a.py"), tool_use("e2", "Edit", file_path="/p/a.py")),
            assistant(tool_use("w1", "Write", file_path="/p/b.py"), tool_use("n1", "NotebookEdit", notebook_path="/p/c.ipynb")),
        ]
        text_, _ = self.digest(recs)
        self.assertIn("- /p/a.py (2x)", text_)
        self.assertIn("- /p/b.py (1x)", text_)
        self.assertIn("- /p/c.ipynb (1x)", text_)

    def test_git_operation_and_pr_link(self):
        recs = [
            tool_result("g1", toolUseResult={"gitOperation": {"commit": {"sha": "abcdef1234567890", "branch": "feat", "kind": "commit"}}}),
            tool_result("g2", toolUseResult={"gitOperation": {"push": {"branch": "feat"}}}),
            tool_result("g3", toolUseResult={"gitOperation": {"pr": {"action": "created", "number": 7, "url": "https://example.com/pr/7"}}}),
            {"type": "pr-link", "prNumber": 7, "prRepository": "o/r", "prUrl": "https://example.com/pr/7"},
        ]
        text_, counts = self.digest(recs)
        self.assertIn("commit abcdef1234 on feat", text_)
        self.assertIn("push feat", text_)
        self.assertIn("pr created #7 https://example.com/pr/7", text_)
        self.assertIn("pr-link: o/r#7", text_)
        self.assertEqual(counts["Git"], 4)

    def test_commit_regex_fallback(self):
        recs = [
            assistant(tool_use("b1", "Bash", command="git commit -m x")),
            tool_result("b1", "[main 1a2b3c4] fix: thing\n 1 file changed", toolUseResult={"stdout": "[main 1a2b3c4] fix: thing\n"}),
        ]
        text_, _ = self.digest(recs)
        self.assertIn("commit 1a2b3c4 on main: fix: thing", text_)

    def test_errors_from_is_error(self):
        recs = [
            assistant(tool_use("b1", "Bash", command="false")),
            tool_result("b1", "boom happened\nsecond line", is_error=True),
            assistant(tool_use("b2", "Bash", command="true")),
            tool_result("b2", "fine"),
        ]
        text_, counts = self.digest(recs)
        self.assertIn("- Bash: boom happened", text_)
        self.assertNotIn("second line", text_)
        self.assertEqual(counts["Errors"], 1)

    def test_pending_tool_use(self):
        recs = [
            assistant(tool_use("b1", "Bash", command="done")),
            tool_result("b1"),
            assistant(tool_use("b2", "Bash", command="sleep 999")),
        ]
        s = n.Session(self.write("s1", recs))
        self.assertEqual(s.pending, "Bash: sleep 999")
        text_, counts = n.digest_text(s)
        self.assertEqual(counts["Pending call (died mid-call)"], 1)
        self.assertIn("- Bash: sleep 999", text_)

    def test_no_pending_when_all_answered(self):
        recs = [assistant(tool_use("b1", "Bash", command="x")), tool_result("b1")]
        self.assertIsNone(n.Session(self.write("s1", recs)).pending)

    def test_subagents_and_final_text(self):
        recs = [
            assistant(tool_use("a1", "Agent", subagent_type="reviewer", description="check diff")),
            assistant(text("first")), assistant(text("second")), assistant(text("third")), assistant(text("fourth")),
        ]
        text_, _ = self.digest(recs)
        self.assertIn("- reviewer: check diff", text_)
        final = text_.split("## Final assistant text")[1]
        self.assertNotIn("first", final)
        self.assertIn("fourth", final)

    def test_corrupt_and_over_cap_lines_tolerated(self):
        path = self.write("s1", [user("before")], raw_lines=["{not json", json.dumps(user("x" * 500))])
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(user("after")) + "\n")
        with mock.patch.object(n, "MAX_LINE", 300):
            s = n.Session(path)
        self.assertEqual(s.prompts, ["before", "after"])

    def test_sidechain_tool_calls_ignored(self):
        recs = [assistant(tool_use("b1", "Bash", command="inner"), isSidechain=True)]
        s = n.Session(self.write("s1", recs))
        self.assertIsNone(s.pending)
        self.assertEqual(s.commands, [])


class TestMasking(unittest.TestCase):
    def test_one_sample_per_secrets_pattern(self):
        samples = {
            "private-key": "-----BEGIN RSA PRIVATE KEY-----\nabcdef\n-----END RSA PRIVATE KEY-----",
            "github-token": "ghp_" + "a" * 24,
            "github-token-pat": "github_pat_" + "b" * 24,
            "api-key": "sk-ant-" + "c" * 24,
            "aws-key": "AKIA" + "D" * 16,
            "slack-token": "xoxb-" + "1234567890" + "ab",
            "google-key": "AIza" + "e" * 35,
            "jwt": "eyJ" + "a" * 10 + "." + "b" * 10 + "." + "c" * 10,
            "token": "Bearer " + "f" * 20,
            "redacted": "MY_API_KEY=hunter2hunter2",
            "url-password": "https://user:hunter2@example.com/x",
        }
        for name, sample in samples.items():
            with self.subTest(name):
                out = n.redact("before " + sample + " after")
                self.assertNotIn("hunter2", out)
                self.assertNotIn(sample, out)
                self.assertTrue(out.startswith("before ") and (out.endswith(" after") or name == "private-key"))
        self.assertIn("<private-key>", n.redact(samples["private-key"]))
        self.assertEqual(n.redact("Bearer " + "f" * 20), "Bearer <token>")
        self.assertEqual(n.redact("MY_API_KEY=hunter2hunter2"), "MY_API_KEY=<redacted>")
        self.assertEqual(n.redact("https://user:hunter2@example.com"), "https://user:<redacted>@example.com")

    def test_digest_masks_every_section(self):
        secret = "ghp_" + "z" * 30
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "s.jsonl")
            recs = [user("first"), user("use " + secret), assistant(tool_use("b", "Bash", command="echo " + secret)), assistant(text(secret))]
            with open(path, "w") as f:
                f.write("\n".join(json.dumps(r) for r in recs))
            text_, _ = n.digest_text(n.Session(path))
        self.assertNotIn(secret, text_)
        self.assertIn("<github-token>", text_)


class TestCli(Store):
    def test_ambiguous_prefix_exits_2_and_lists_matches(self):
        self.write("abc111", [user("a")])
        self.write("abc222", [user("b")])
        code, out, err = self.run_cli("digest", "--project", PROJECT, "--session", "abc")
        self.assertEqual(code, 2)
        self.assertIn("abc111", err)
        self.assertIn("abc222", err)
        self.assertEqual(out, "")

    def test_unique_prefix_latest_and_missing(self):
        self.write("abc111", [user("a")], age=500)
        self.write("def222", [user("b")], age=100)
        out = os.path.join(self.tmp.name, "d.md")
        code, stdout, _ = self.run_cli("digest", "--project", PROJECT, "--session", "latest", "--out", out)
        self.assertEqual(code, 0)
        with open(out, encoding="utf-8") as f:
            self.assertIn("- session: def222", f.read())
        code, _, _ = self.run_cli("digest", "--project", PROJECT, "--session", "zzz")
        self.assertNotEqual(code, 0)

    def test_exclude_skips_latest(self):
        self.write("abc111", [user("a")], age=500)
        self.write("def222", [user("b")], age=100)
        out = os.path.join(self.tmp.name, "d.md")
        self.run_cli("digest", "--project", PROJECT, "--session", "latest", "--exclude", "def2", "--out", out)
        with open(out, encoding="utf-8") as f:
            self.assertIn("- session: abc111", f.read())

    def test_default_output_is_private_temp_file(self):
        self.write("abcdef12-xyz", [user("a")])
        code, stdout, _ = self.run_cli("digest", "--project", PROJECT, "--session", "abcdef12")
        self.assertEqual(code, 0)
        path = stdout.splitlines()[0].split(": ", 1)[1]
        self.addCleanup(os.unlink, path)
        self.assertTrue(os.path.basename(path).startswith("necromancy-abcdef12-"))
        self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)

    def test_out_path_is_forced_to_0600(self):
        self.write("s1", [user("a")])
        out = os.path.join(self.tmp.name, "pre.md")
        with open(out, "w") as f:
            f.write("old")
        os.chmod(out, 0o644)
        self.run_cli("digest", "--project", PROJECT, "--session", "s1", "--out", out)
        self.assertEqual(stat.S_IMODE(os.stat(out).st_mode), 0o600)

    def test_receipt_holds_no_message_text(self):
        marker = "uniquemarkerphrase"
        recs = [
            {"type": "custom-title", "customTitle": marker + "title"},
            user("ask " + marker),
            assistant(text("answer " + marker), tool_use("b", "Bash", command="echo " + marker)),
        ]
        self.write("s1", recs)
        out = os.path.join(self.tmp.name, "d.md")
        code, stdout, stderr = self.run_cli("digest", "--project", PROJECT, "--session", "s1", "--out", out)
        self.assertEqual(code, 0)
        self.assertNotIn(marker, stdout + stderr)
        self.assertIn("bytes:", stdout)
        self.assertIn("span:", stdout)
        self.assertIn("First request=1", stdout)
        with open(out, encoding="utf-8") as f:
            self.assertIn(marker, f.read())

    def test_large_session_stays_under_cap(self):
        recs = []
        for i in range(20000):
            k = i % 4
            if k == 0:
                recs.append(user(f"prompt {i} " + "word " * 80))
            elif k == 1:
                recs.append(assistant(tool_use(f"t{i}", "Bash", command=f"echo {i} " + "y" * 300), text("reply " * 200)))
            elif k == 2:
                recs.append(tool_result(f"t{i-1}", "error " * 100, is_error=True))
            else:
                recs.append(assistant(tool_use(f"e{i}", "Edit", file_path=f"/p/{'d' * 80}/file{i}.py")))
        text_, _ = self.digest(recs)
        self.assertLessEqual(len(text_.encode("utf-8")), 32 * 1024)

    def test_multibyte_truncation_stays_valid(self):
        recs = [user("é" * 300)] + [assistant(tool_use(f"e{i}", "Edit", file_path="/é/" + "é" * 150 + str(i))) for i in range(200)]
        recs += [tool_result("x", "é" * 3000, is_error=True)] * 15
        text_, _ = self.digest(recs)
        self.assertLessEqual(len(text_.encode("utf-8")), 32 * 1024)


if __name__ == "__main__":
    unittest.main()
