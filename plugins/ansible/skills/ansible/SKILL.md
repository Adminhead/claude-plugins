---
name: ansible
description: 'Writes, reviews and runs Ansible playbooks, roles and inventories safely: idempotency proof, check mode limits, validate hooks, handlers, vault or sops secrets, FQCN and become. Use when editing a playbook, role or inventory, running ansible-playbook or ansible-lint, using --check or --limit, or fixing a task that reports changed every run.'
---

# Ansible

Not for Terraform or OpenTofu (the `terraform` skill), Dockerfiles or Compose (`docker`), Kubernetes manifests (`kubernetes`), or Nix.

Checked against ansible-core 2.21 docs (docs.ansible.com/projects/ansible/latest) and ansible-lint 26.9 on 2026-10-10. Ansible runs as root on real machines, so the first job is to know what a command can touch.

## Safety contract

- Run freely: `ansible-playbook --syntax-check`, `ansible-lint`, `ansible-inventory --graph`, `ansible-doc`, and `ansible-playbook --check --diff --limit <host>` against hosts the user named.
- Run against real hosts (no `--check`) only when asked, and always with an explicit `--limit`. Say the playbook, limit, and tags before running. A playbook with no `--limit` hits every host in its `hosts:` line.
- Never run `ansible-vault decrypt`, `sops -d`, or `ansible-vault view` and paste the result. Never print decrypted vars, `--diff` output of secret files, or `-vvv` output of a task that handles credentials.
- Treat `shell`, `command`, `raw`, `reboot`, `file: state=absent`, `package: state=absent`, and anything that restarts a service as changing state. Name them before running.

## Use the project's runner

Find how Ansible is meant to run before typing `ansible-playbook`: a `mise.toml` task, `Makefile`, `Taskfile`, `justfile`, `pyproject.toml` or `uv.lock` (use `uv run ansible-playbook ...`), `requirements.yml`, `ansible.cfg`, or a CI workflow. The wrapper pins the Ansible version and sets the inventory, vault or sops access, and collection paths, so a bare `ansible-playbook` often uses the wrong version or fails to decrypt. Common forms are `mise exec -- ansible-playbook ...` and `uv run ansible-playbook ...`. Install collections with `ansible-galaxy collection install -r requirements.yml` if the project does.

## Workflow for a change

1. Read `ansible.cfg`, the inventory, the playbook, and the role you will touch. Find which `group_vars` and `host_vars` apply to the target.
2. Edit. Keep each task one action with a `name:` that says the outcome.
3. `ansible-playbook <play>.yml --syntax-check`, then `ansible-lint`.
4. `ansible-playbook <play>.yml --check --diff --limit <host>` and read the diff. Check mode does not prove the change works (see below).
5. Report. Run for real only on instruction, with `--limit` and `--tags` if the play is large.
6. After a real run, prove idempotency by rerunning the same command and confirming the recap shows `changed=0` and `failed=0` for every host. A rerun that still changes something is a bug in the task (see below).

## Layout

```
ansible.cfg
inventory/
  hosts.yml            # or a dynamic source
  group_vars/
    all.yml            # shared defaults
    <group>.yml
  host_vars/<host>.yml
playbooks/<name>.yml   # thin: hosts, roles, a few pre/post tasks
roles/<role>/
  tasks/main.yml
  handlers/main.yml
  defaults/main.yml    # overridable defaults
  templates/  files/  meta/main.yml
requirements.yml
```

- Keep playbooks thin and put logic in roles. A role takes variables, so the same role serves several hosts.
- Put a value in `defaults/` if callers should override it, in `vars/` if they should not, and in `group_vars` or `host_vars` for per-environment data. Prefix role variables with the role name to avoid collisions.
- Secrets live next to the data they belong to (see Secrets), never in `defaults/`.
- Use a group to say what a host is, and a variable to say how it differs.

## Idempotency

A correct task changes the host once and reports `ok` on every later run.

- Prefer a module that owns the state (`ansible.builtin.package`, `service`, `file`, `copy`, `template`, `lineinfile`, `user`, `systemd_service`) over `command` or `shell`.
- For `command`, `shell`, and `raw`, tell Ansible when work is needed. Use `creates:` or `removes:` (a path or glob; the task is skipped if it exists, or does not exist) or set `changed_when:` and `failed_when:` from the registered result. Otherwise the task reports `changed` every run.
  ```yaml
  - name: Initialise the database
    ansible.builtin.command: /opt/app/bin/init-db
    args:
      creates: /var/lib/app/.initialised
  ```
- `changed_when: false` is right for read-only probes. Do not use it to hide a task that does change something.
- Handlers run only when a task that notifies them reports `changed`, and once at the end of the play. Restart or reload services from handlers, not from a plain task. Use `meta: flush_handlers` if a later task needs the restart first. A handler does not run if the play fails before it, so a failed run can leave a changed file with an unrestarted service, and a plain rerun won't fix it: the task now reports `ok` and never notifies. Run with `--force-handlers` (or set `force_handlers: true`) so notified handlers still run on failure, or restart the service explicitly after fixing.
- Do not template timestamps, random values, or `ansible_managed` with dates into files, because the content changes every run.

## Check mode and its limits

`--check` simulates. Modules that do not support it report nothing and do nothing, and tasks that depend on registered results of skipped tasks can misreport. Most importantly, check mode renders a template but never asks the service whether the file is valid. A haproxy config with a bad ACL passed `--check` and broke the service on the real run.

- Add `validate:` to `template` and `copy` for any config the service can check. The command gets the candidate file as `%s`, and the file is installed only if it exits 0. This works on real runs, so a bad file never lands.
  ```yaml
  - name: Install haproxy config
    ansible.builtin.template:
      src: haproxy.cfg.j2
      dest: /etc/haproxy/haproxy.cfg
      validate: haproxy -c -f %s
    notify: Reload haproxy
  ```
  Others: `nginx -t -c %s`, `visudo -cf %s` for sudoers, `sshd -t -f %s`, `named-checkconf %s`. The command runs without a shell, so pipes and expansions do not work.
- Use `check_mode: false` on a read-only task whose result later tasks need, and `when: not ansible_check_mode` to skip a task that cannot be simulated.
- `--diff` shows file changes. It can leak secrets, so set `diff: false` on tasks that write credentials.
- Treat a clean `--check` as "no obvious error", not "safe". Prove behavior with a real run on one host (`--limit`) and an idempotent rerun.

## Secrets

- Use whatever the project already uses: Ansible Vault (`ansible-vault encrypt_string` values, or whole `vault.yml` files read through `--vault-id` or `ansible.cfg`) or sops-encrypted vars loaded through the `community.sops` collection. Do not add a second scheme.
- Put `no_log: true` on tasks that handle passwords, tokens, or keys, including loops over them. Without it, failures and `-v` output print the values.
- Keep encrypted files encrypted in the repo. Name vault variables so their purpose is clear (`vault_db_password`) and reference them from plain variables.
- Never echo secrets into `debug`, `ansible.builtin.copy: content:` that is logged, or shell command lines, which appear in process lists and logs.

## Style that ansible-lint enforces

- Use fully qualified collection names (FQCN): `ansible.builtin.copy`, `community.general.ufw`. Short names are ambiguous and flagged by the `fqcn` rule.
- Name every task and play. Use `true` and `false`, not `yes` and `no`.
- Set `mode:` on `file`, `copy`, and `template` tasks as a quoted string (`"0644"`).
- `become: true` goes on the play or task that needs root. Do not blanket the whole play if only one task needs it. Use `become_user:` for service accounts.
- Let `ansible-lint --fix` handle mechanical changes, then read the diff before accepting it. Do not silence rules with `# noqa` or `skip_list` to get a clean run. Fix the task, or explain why the rule is wrong for it.

## Troubleshooting

- `UNREACHABLE`: check inventory name, `ansible_host`, user, and key before touching the playbook.
- A task is always `changed`: apply the idempotency section above, and run with `--diff` on one host to see what differs.
- Variable undefined: `ansible-inventory --host <host>` shows the merged vars but can print decrypted sops values, so list only the key names (`| jq 'keys'`) and never show the output. Extra vars from `-e` override everything else.
- Slow or hung runs: `ansible-playbook -vv` first, and use `-vvv` only on tasks without secrets.
