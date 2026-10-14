# Bats

Read this to write or debug shell tests with bats-core. Behavior here matches the bats-core docs and was run against bats-core 1.13.0.

## Install and run

Install bats-core through the repo's tool manager (mise, devenv, Nix), `brew install bats-core`, `npm install --save-dev bats`, or a `git clone` of a release tag. Pin the version so CI and laptops agree.

```bash
bats tests/                    # .bats files at the top level of tests/
bats -r tests/                 # recurse into subdirectories
bats -f 'parses flags' tests/  # run tests whose name matches a regex
bats --print-output-on-failure --formatter tap tests/   # TAP output for CI
```

Exit status is 0 when every test passes and 1 otherwise. `-j <n>` runs tests in parallel and needs GNU parallel or `rush`, so don't use it with tests that share state. Look for `.bats` files and a `test` target in the repo (Makefile, Taskfile, package scripts) and use its command.

## Layout

```text
script.sh
tests/
  script.bats
  test_helper.bash         # shared setup, loaded with `load test_helper`
```

The script should be testable without running it. Guard the entry point, so a test can `source` it and call functions directly.

```bash
# end of script.sh
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
```

## A test file

```bash
#!/usr/bin/env bats

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../script.sh"
  WORKDIR=$BATS_TEST_TMPDIR           # unique per test, removed by bats
}

@test "prints usage and exits 2 without arguments" {
  run -2 "$SCRIPT"
  [[ $output == *"Usage:"* ]]
}

@test "dry-run changes nothing" {
  touch "$WORKDIR/keep"
  run -0 "$SCRIPT" --dry-run "$WORKDIR/keep"
  [ -e "$WORKDIR/keep" ]
  [[ $output == *"[dry-run]"* ]]
}

@test "rejects an unknown option" {
  run ! "$SCRIPT" --bogus
  [[ $output == *"unknown option"* ]]
}
```

- `run cmd args` runs the command in a subshell and sets `$status`, `$output` (stdout and stderr combined), and `${lines[@]}`. It always returns 0 so the test continues.
- `run -N cmd` fails the test unless the exit status is N. `run ! cmd` requires a nonzero status. Use `run !` rather than a bare `! cmd`, because a bare negation only fails the test when it is the last command.
- `run --separate-stderr cmd` splits stderr into `$stderr` and `${stderr_lines[@]}`.
- Bats sets `set -e` inside tests, so a plain call `cmd args` fails the test on nonzero. Skip `run` when you only need success.
- Because `run` uses a subshell, variables a function sets don't persist after `run`. To test state changes, call the function directly.
- `run cmd | grep x` pipes the empty result of `run`, which tests nothing. Use `run bats_pipe cmd \| grep x`.
- Assertions are plain `[ ]` or `[[ ]]`. Optional `bats-assert` and `bats-support` add `assert_success`, `assert_output`, and `assert_line`, loaded with `bats_load_library` or `load` per their README.

## Setup, teardown, and temp state

| Hook | Runs |
| --- | --- |
| `setup`, `teardown` | Around each test. `teardown` runs even when the test fails, and `teardown` fails a test only through its final status |
| `setup_file`, `teardown_file` | Once per file. Variables exported in `setup_file` reach the tests |
| `setup_suite`, `teardown_suite` | Once per run, defined in `setup_suite.bash` next to the first `.bats` file |

- Use `$BATS_TEST_TMPDIR` for per-test files and `$BATS_FILE_TMPDIR` for files shared across a file. Bats cleans them up, so don't write to the real home, `/tmp` names, or the repo.
- Keep code outside `@test` and hooks to a minimum. Bats evaluates the file several times, so top-level output prints repeatedly.
- To print from a test, write to file descriptor 3: `echo '# debug' >&3`.
- A background process inherits FD 3 and can make bats hang until it exits. Start long-lived children with `cmd 3>&- &`.

## Stubbing commands

Put a fake executable first on `PATH`, so the script calls it without edits.

```bash
setup() {
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  PATH="$BATS_TEST_TMPDIR/bin:$PATH"
  cat > "$BATS_TEST_TMPDIR/bin/curl" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$BATS_TEST_TMPDIR/curl.calls"
echo '{"ok":true}'
STUB
  chmod +x "$BATS_TEST_TMPDIR/bin/curl"
}

@test "calls the API once" {
  run -0 "$BATS_TEST_DIRNAME/../fetch.sh" https://example.test/items
  [ "$(wc -l < "$BATS_TEST_TMPDIR/curl.calls")" -eq 1 ]
}
```

Never let a test reach a real network, cloud account, or the real `rm -rf` target. Stub those commands, and point the script at `$BATS_TEST_TMPDIR`.

## Skipping and tags

Bats has `skip`, with an optional reason, and no conditional `skip_if` helper. Skip conditionally with a plain `if`:

```bash
@test "reads the macOS keychain" {
  if [[ $(uname -s) != Darwin ]]; then
    skip "needs macOS"
  fi
  run -0 ./read-key.sh
}
```

`setup` and `teardown` still run for a skipped test. Skip with a reason a reader can act on, and don't skip to get a green run.

Tag a test with a comment, `# bats test_tags=slow,network`, and select with `bats --filter-tags '!slow' tests/`. `# bats file_tags=...` tags every test in the file.

Call `bats_require_minimum_version 1.5.0` in a file that uses `run -N` or `run !`. The function exists from bats 1.7.0, and code written for a newer bats can otherwise pass erroneously on an older one.

## What to test

- Success path, each documented exit code, and each error message that callers parse.
- Option parsing: unknown flag, missing value, `--` handling, `--help`.
- Idempotency: run twice and compare state.
- Dry-run: nothing written, and the planned commands are printed.
- Names with spaces, leading dashes, and an empty variable, for scripts that handle user input.
- Cleanup: the temp directory is gone after both success and failure.

Coverage is a diagnostic here. A passing test must fail when the behavior breaks, so check one by temporarily breaking the code.
