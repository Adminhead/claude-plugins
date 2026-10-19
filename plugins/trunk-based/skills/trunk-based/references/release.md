# Release sequences on trunk

Plain-git sketch; the sources give no exact commands. Every push line needs the user's go-ahead.

```bash
# Release from trunk: a tag on a trunk commit
git tag -a v1.4.0 -m "v1.4.0" <sha-on-main>
git push origin v1.4.0                       # ask first

# Branch for release: cut late, from the tag or a chosen main commit
git branch release/1.4 v1.4.0

# A fix lands on trunk first, with a test
git switch main   # ...commit fix and test, merged via the normal route...

# Then cherry-pick to the release branch (-x records the source sha)
git switch release/1.4 && git cherry-pick -x <fix-sha>
git tag -a v1.4.1 -m "v1.4.1"
git push origin release/1.4 v1.4.1           # ask first

# Never merge release/1.4 back into main.
# When the version is out of production: tag the released commit, then delete the branch (ask before deleting remote).
```

One person (a rotating "Merge Meister") does the cherry-picks.
