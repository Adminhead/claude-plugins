# Husky and lint-staged

Read this for a Node-only repo that doesn't use `.pre-commit-config.yaml`. Husky runs shell scripts from Git hooks, and lint-staged runs commands on only the staged files. Checked against the Husky docs (typicode.github.io/husky) and the lint-staged README.

## Steps

1. Detect the package manager from the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock` or `bun.lockb`). Use its commands below in place of `npm`.
2. Install dev dependencies: `npm install --save-dev husky lint-staged prettier`. Skip any already present. Add Prettier only when the repo has no formatter.
3. Run `npx husky init`. It creates `.husky/pre-commit` and adds `"prepare": "husky"` to `package.json`, which activates the hooks for each clone after install.
4. Edit `.husky/pre-commit`. It is a plain shell file, so put one command per line:

   ```sh
   npx lint-staged
   ```

   Add `npm run typecheck` or `npm test` only when the script exists, and only when it runs fast. Otherwise leave it to CI.
5. Configure lint-staged in `package.json` or `.lintstagedrc.json`:

   ```json
   {
     "*": "prettier --ignore-unknown --write"
   }
   ```

   `--ignore-unknown` skips files Prettier can't parse. Add narrower globs such as `"*.{js,ts}": "eslint --fix"` for linters. lint-staged re-stages files that its commands fix.
6. Verify with `npx lint-staged`, then make a throwaway change and confirm the hook runs at commit time.

## Notes

- `HUSKY=0` disables hooks, which is how CI installs without activating them.
- Husky hooks live in the repo, so teammates get them through `prepare` on install. `.git/hooks` is not committed.
- Run the same checks in CI (`npm run lint`, `prettier --check .`), since a local hook can be skipped.
