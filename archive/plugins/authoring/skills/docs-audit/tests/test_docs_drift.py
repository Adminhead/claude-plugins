import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "docs_drift.py"


def run(repo, *args):
    return subprocess.run([sys.executable, str(SCRIPT), str(repo), *args], capture_output=True, text=True)


def make_repo(tmp_path):
    (tmp_path / "package.json").write_text(json.dumps({"scripts": {"test": "x"}}))
    (tmp_path / "Makefile").write_text("build:\n\techo hi\n")
    (tmp_path / "app.py").write_text('import os\nos.environ.get("API_BASE_URL")\nos.getenv("HIDDEN_SETTING")\n')
    (tmp_path / "other.md").write_text("# other\n")
    return tmp_path


def test_clean_repo_exits_zero(tmp_path):
    repo = make_repo(tmp_path)
    (repo / "README.md").write_text("Run `npm run test`.\n\n[other](other.md)\n\nSet `API_BASE_URL` and `HIDDEN_SETTING`.\n")
    result = run(repo)
    assert result.returncode == 0, result.stdout
    assert "0 finding(s)" in result.stdout


def test_reports_missing_command_link_and_env(tmp_path):
    repo = make_repo(tmp_path)
    (repo / "README.md").write_text(
        "```sh\nnpm run deploy\nmake release\n```\n\n[gone](gone.md)\n\nSet `API_BASE_URL` and `OLD_API_TOKEN`.\n"
    )
    result = run(repo, "--json")
    assert result.returncode == 1
    messages = [f["message"] for f in json.loads(result.stdout)]
    assert any("'deploy'" in m for m in messages)
    assert any("'release'" in m for m in messages)
    assert any("gone.md" in m for m in messages)
    assert any("OLD_API_TOKEN is documented" in m for m in messages)
    assert any("HIDDEN_SETTING is read but not documented" in m for m in messages)


def test_stale_fingerprint(tmp_path):
    repo = make_repo(tmp_path)
    git = lambda *a: subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t", *a], check=True, capture_output=True, text=True)
    git("init", "-q")
    git("add", ".")
    git("commit", "-qm", "one")
    sha = git("rev-parse", "--short", "HEAD").stdout.strip()
    (repo / "README.md").write_text(f"> Fingerprint: git:{sha}\n> Monitored: app.py\n\n`API_BASE_URL` `HIDDEN_SETTING`\n")
    git("add", ".")
    git("commit", "-qm", "two")
    assert run(repo).returncode == 0
    (repo / "app.py").write_text("# changed\n")
    git("commit", "-qam", "three")
    result = run(repo, "--json")
    assert any(f["kind"] == "stale" for f in json.loads(result.stdout))


def kinds(result):
    return [(f["kind"], f["message"]) for f in json.loads(result.stdout)]


def test_prose_make_is_ignored_but_inline_code_is_checked(tmp_path):
    repo = make_repo(tmp_path)
    (repo / "README.md").write_text("Please make the dirs first, then run `make deploy`.\n\n`API_BASE_URL` `HIDDEN_SETTING`\n")
    messages = [m for k, m in kinds(run(repo, "--json")) if k == "command"]
    assert messages == ["no make target named 'deploy'"]


def test_env_template_names_count_as_documentation(tmp_path):
    repo = make_repo(tmp_path)
    (repo / ".env.example").write_text("API_BASE_URL=<placeholder>\nHIDDEN_SETTING=<placeholder>\nOLD_API_TOKEN=<placeholder>\n")
    (repo / "README.md").write_text("# readme\n")
    messages = [m for k, m in kinds(run(repo, "--json")) if k == "env"]
    assert messages == ["OLD_API_TOKEN is documented but no code reads it"]


def test_unresolvable_fingerprint_is_reported(tmp_path):
    repo = make_repo(tmp_path)
    (repo / "README.md").write_text("> Fingerprint: git:deadbeef\n> Monitored: app.py\n\n`API_BASE_URL` `HIDDEN_SETTING`\n")
    assert ("stale", "fingerprint commit not found or not a git repo") in kinds(run(repo, "--json"))
