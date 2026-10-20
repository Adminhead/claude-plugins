# forges paired routing evals

Routing checks with both forge metas loaded at once: `github-meta` and `forgejo-meta`, plus `forgejo-release`, `gh-release` and `git-commit`. Per-plugin evals load one plugin, so they can't show whether the right forge's skill wins when both sets are installed. Each case uses a Codeberg or GitHub (or Forgejo or GitHub remote, for the scaffold cases) prompt. Its graders check that the expected skill fires and that the counterpart on the other forge stays quiet.

```
claude plugin eval . --eval-dir evals/forges/evals --trust-plugin --scaffold --ablation none -j 4 --no-publish
```

Run it from the repo root: a case's `plugins:` entries must sit under the directory `claude plugin eval` targets. `--ablation none`: a no-plugin baseline means nothing for routing.

The four scaffold cases (`ci-red-forgejo-remote`, `github-dir-on-forgejo`, `deps-forgejo`, `deps-github`) build their workspace from `scaffold.sh` only when the run passes `--scaffold`. Without it they run in an empty directory with no remote, and the routing signal is lost.

Keep the `plugins:` lists in step with `github-meta`, `forgejo-meta` and the three extra plugins. Each list is the full dependency closure of both metas plus `forgejo-release`, `gh-release` and `git-commit`.
