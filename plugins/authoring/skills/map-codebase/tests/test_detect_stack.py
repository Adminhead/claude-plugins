import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "detect_stack.py"


def run(repo, *args):
    return subprocess.run([sys.executable, str(SCRIPT), str(repo), *args], capture_output=True, text=True)


def touch(root, rel):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x\n")


def test_groups_manifest_ci_and_container_files(tmp_path):
    for rel in ["package.json", "go.mod", ".github/workflows/ci.yml", ".gitlab-ci.yml",
                "Dockerfile", "deploy/compose.yaml", "node_modules/pkg/package.json", "README.md"]:
        touch(tmp_path, rel)
    result = run(tmp_path, "--json")
    assert result.returncode == 0
    found = json.loads(result.stdout)
    assert found["manifest"] == ["go.mod", "package.json"]
    assert found["ci"] == [".github/workflows/ci.yml", ".gitlab-ci.yml"]
    assert found["container"] == ["Dockerfile", "deploy/compose.yaml"]


def test_output_is_capped_per_kind(tmp_path):
    for i in range(45):
        touch(tmp_path, f"pkg{i:02d}/package.json")
    manifests = json.loads(run(tmp_path, "--json").stdout)["manifest"]
    assert len(manifests) == 41
    assert manifests[-1] == "... and 5 more"


def test_missing_directory_exits_two(tmp_path):
    assert run(tmp_path / "nope").returncode == 2
