# Runners, labels and images

Sources: the reference page (`runs-on`, `container`, `uses`) and the troubleshooting page.

## Labels

`runs-on: docker` sends the job only to a runner that registered the `docker` label. Labels are chosen by whoever registered the runner, so they differ per instance. The available labels for a repo are listed at `<host>/<owner>/<repo>/settings/actions/runners`. Never invent a label; ask the user or read that page.

If no online runner has the label, the job waits until one comes online, and the Actions tab shows it queued. That is the first thing to check when a run never starts.

Other environments are also chosen by label: `lxc` (jobs run in an LXC container; `container`, `services` and some other keys are ignored there) and `self-hosted` (host execution).

## Images

Most runners provide a Debian bookworm image with Node.js, not a full Ubuntu image. For other toolchains, set `container.image` (use a fully qualified image name) or install tools in a step. Service containers go under `services:`.

## Action resolution

A short `uses: actions/checkout@v7` resolves against the instance's `DEFAULT_ACTIONS_URL` (default `https://data.forgejo.org`, set by the instance admin). Prefer the full URL, such as `https://code.forgejo.org/actions/checkout@v7`, so the workflow behaves the same on any instance. `uses: docker://image:tag` runs a container image.

## Runner administration

Registering, upgrading or deleting runners and changing instance Actions settings is for the instance or org admin. Report what a change needs; do not attempt it. Runner v8 and later validate workflows against the schema; `forgejo-runner validate --repository <url>` needs v9 or later.
