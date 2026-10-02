# Recovery and bisect

Read for `git bisect` automation, reflog recovery, or undoing a rebase, reset, merge, or lost stash.

## Bisect

Bisect checks out commits between a known-good and a known-bad one, so start with a clean tree and ask before stashing. Use a script, because stepping by hand needs many turns.

```bash
git bisect start <bad> <good>
git bisect run <command> [args]
git bisect log          # record of each verdict
git bisect reset        # return to the original branch, always run this
```

The command's exit status is the verdict:

| Exit status | Meaning |
| --- | --- |
| `0` | This commit is good |
| `1` to `127`, except `125` | This commit is bad |
| `125` | Cannot test this commit (build breaks); skip it |
| `128` and above | Abort the bisect |

- Use the narrowest command that fails for the bug, such as one test. Write it so a build error exits `125` rather than `1`, or the bisect blames the wrong commit.
- The result names the first bad commit. Read that commit's diff before reporting it as the cause, and say that an automated test produced the verdict.
- A flaky test makes bisect lie. Run the command several times at the endpoints first to confirm good stays good and bad stays bad.
- Add `--first-parent` to `start` on a merge-heavy mainline to find the merge that introduced the bug.

## Reflog

The reflog records where each ref and `HEAD` pointed, locally. Commits dropped by a rebase, reset, or branch delete usually remain reachable from it. By default entries expire after 90 days when reachable and 30 days when not (`gc.reflogExpire`, `gc.reflogExpireUnreachable`).

```bash
git reflog show HEAD            # newest first: HEAD@{0}, HEAD@{1}, ...
git reflog show <branch>
git log --oneline -g HEAD       # same data with subjects
```

Pick the entry from just before the mistake, then restore it without moving any branch:

```bash
git branch rescue/<name> <sha-or-HEAD@{n}>
```

Inspect `rescue/<name>`. Moving the real branch back is a `git reset --hard` or `git branch -f`, which needs approval, since it discards what is on the branch now. A rescue branch avoids the question.

## Common repairs

| Situation | Action |
| --- | --- |
| Rebase in progress, wrong result | `git rebase --abort` |
| Merge in progress, unwanted | `git merge --abort` |
| Rebase finished, wrong result | Find the pre-rebase tip in `git reflog` (the entry before `rebase (start)`), or use the `backup/` ref, and make a rescue branch. Git also keeps `ORIG_HEAD` after rebase, merge, and reset. Reset the branch to it only with approval |
| Branch deleted by mistake | Find its last commit in `git reflog`, then `git branch <name> <sha>` |
| `reset --hard` lost committed work | Same as above: reflog, then a rescue branch |
| Lost uncommitted work | The reflog can't help. Check the editor's local history and `git fsck --lost-found` for dangling blobs, and set expectations |
| Dropped stash | `git fsck --unreachable \| grep commit` lists candidates. Inspect with `git show <sha>`, restore with `git stash store -m "<msg>" <sha>` |
| Bad commit already pushed to a shared branch | `git revert`, not a rewrite |

## After recovery

Say what was restored and from which ref. Leave the backup and rescue branches in place until the user confirms, and let them delete those.
