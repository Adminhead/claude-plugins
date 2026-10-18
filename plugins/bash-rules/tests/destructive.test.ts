import { describe, expect, test } from 'claude-code/testing'
import { askRule, classify, withAsk } from '../hooks/danger/rules'

// The destructive rules bash-rules adds to the ones ported from bash-danger-guard (danger.test.tsx).

const rule = (c: string) => classify(c)?.rule ?? null
const ask = (c: string) => askRule(c)?.rule ?? null

const expectAll = (cases: string[], want: string | null) => {
  for (const c of cases) expect([c, rule(c)]).toEqual([c, want])
}

describe('infra-destroy', () => {
  test('terraform, tofu, terragrunt, pulumi and cdk destroy, kubectl delete of namespaces or everything, helm uninstall', () => {
    expectAll(
      [
        'terraform destroy',
        'terraform destroy -auto-approve',
        'terraform -chdir=infra destroy',
        'terraform apply -destroy',
        'terraform -chdir=infra apply -destroy -auto-approve',
        'tofu destroy',
        'tofu apply -destroy',
        'terragrunt destroy',
        'terragrunt run-all destroy',
        'pulumi destroy --yes',
        'cdk destroy MyStack',
        'cd infra && terraform destroy',
        'bash -c "terraform destroy"',
        'timeout 600 terraform destroy',
        'kubectl delete ns foo',
        'kubectl delete namespace foo',
        'kubectl delete namespaces a b',
        'kubectl delete namespace/foo',
        'kubectl -n x delete pods --all',
        'kubectl delete pods --all-namespaces -l app=x',
        'kubectl delete deploy -A --all',
        'kubectl --context prod delete ns foo',
        'oc delete project-x --all',
        'helm uninstall rel',
        'helm -n x uninstall rel',
        'helm delete rel',
      ],
      'infra-destroy',
    )
    expect(classify('terraform destroy')?.message).toMatch(/^bash-rules: .*Hand it to the user to run\.$/)
  })

  test('the pass column', () => {
    expectAll(
      [
        'terraform plan',
        'terraform plan -destroy',
        'terraform apply',
        'terraform state list',
        'tofu init',
        'kubectl get ns',
        'kubectl delete pod foo',
        'kubectl delete -f deploy.yaml',
        'kubectl -n staging delete deploy web',
        'kubectl describe namespace foo',
        'helm list',
        'helm upgrade --install rel chart',
        'echo terraform destroy',
        'git commit -m "terraform destroy docs"',
        'pulumi preview',
      ],
      null,
    )
  })
})

describe('container-prune', () => {
  test('a prune of all images or of volumes, and compose down -v', () => {
    expectAll(
      [
        'docker system prune -a', 'docker system prune --all -f', 'docker system prune --volumes', 'docker system prune -af', 'podman system prune -a',
        'docker volume prune', 'docker volume prune -f',
        'docker compose down -v', 'docker compose down --volumes', 'docker compose -f dev.yml -p app down -v --remove-orphans', 'docker-compose down -v',
        'docker-compose down --rmi all --volumes', 'podman-compose down -v', 'cd app && docker compose down -v',
      ],
      'container-prune',
    )
  })

  test('the pass column', () => {
    expectAll(['docker compose down', 'docker-compose down --remove-orphans', 'docker compose up -d -V', 'docker compose -v', 'docker compose logs -f', 'docker system prune', 'docker system prune -f', 'docker image prune', 'docker ps -a', 'docker system df', 'docker volume ls', 'docker run --rm -a stdout x'], null)
  })
})

describe('db-drop', () => {
  test('dropdb, DROP and TRUNCATE through a client flag, heredoc, here-string or pipe, FLUSHALL', () => {
    expectAll(
      [
        'dropdb mydb',
        'dropdb -h db -U app mydb',
        "psql -c 'DROP TABLE users'",
        "psql -d app -c 'drop database app'",
        "psql --command='DROP SCHEMA public CASCADE'",
        'psql -d app <<EOF\ntruncate table t;\nEOF',
        "psql app <<'SQL'\nBEGIN; TRUNCATE users; COMMIT;\nSQL",
        "mysql -e 'drop database x'",
        "mysql --execute='DROP TABLE t' app",
        'echo "DROP SCHEMA s CASCADE" | psql',
        'psql app <<< "DROP TABLE t"',
        "sqlite3 app.db 'DROP TABLE t'",
        'mysqladmin -u root drop app',
        'redis-cli FLUSHALL',
        'redis-cli -n 2 flushdb',
        "mongosh app --eval 'db.dropDatabase()'",
        "docker compose exec db psql -c 'DROP TABLE t'",
        "kubectl exec -it pg-0 -- psql -c 'TRUNCATE users'",
        'ssh db1 "psql -c \'DROP TABLE t\'"',
        'ssh db1 dropdb app',
      ],
      'db-drop',
    )
  })

  test('the pass column', () => {
    expectAll(
      [
        "psql -c 'select 1'",
        "psql -d truncate_test -c 'select 1'",
        'psql -d app <<EOF\nselect * from drops;\nEOF',
        "psql -c 'DROP INDEX i'",
        "psql -c 'ALTER TABLE t DROP COLUMN c'",
        'psql -f migrate.sql',
        'createdb app',
        'redis-cli get x',
        'echo "DROP TABLE t"',
        'git commit -m "DROP TABLE support"',
        'grep -r "DROP TABLE" migrations',
        "docker compose exec db psql -c 'select 1'",
        'ssh db1 "psql -c \'select 1\'"',
      ],
      null,
    )
  })
})

describe('git-clean (ask)', () => {
  test('a forced clean that also removes ignored files asks', () => {
    for (const c of ['git clean -fdx', 'git clean -fx', 'git clean -f -d -X', 'git clean --force -x', 'git -C repo clean -xfd', 'cd x && git clean -fdx']) expect([c, ask(c)]).toEqual([c, 'git-clean'])
  })

  test('the pass column', () => {
    for (const c of ['git clean -fd', 'git clean -n -x', 'git clean -ndx', 'git clean -x', 'git status', 'echo git clean -fdx']) expect([c, ask(c)]).toEqual([c, null])
  })

  test('the caller can exempt it (a linked worktree)', async () => {
    const run = (exempt: boolean) => withAsk('git clean -fdx', async () => undefined, () => {}, async h => exempt && h.rule === 'git-clean')
    expect(await run(false)).toEqual({ ask: expect.stringMatching(/^bash-rules: .*ignored files/) })
    expect(await run(true)).toEqual({})
    // An exemption check that throws keeps the ask.
    const thrown = await withAsk('git clean -fdx', async () => undefined, () => {}, async () => { throw new Error('x') })
    expect(thrown).toEqual({ ask: expect.any(String) })
  })
})

describe('rm-critical', () => {
  test('rm, recursive or not, of system files and dirs, home credentials and shell startup files', () => {
    expectAll(
      [
        'rm -f /etc/passwd',
        'rm /etc/hosts',
        'rm /etc/*',
        'rm -f /usr/bin/*',
        'rm -rf /etc/nginx/sites-enabled/x',
        'rm -rf /var/lib/postgresql',
        'rm /boot/vmlinuz',
        'rm /lib/x86_64-linux-gnu/libc.so.6',
        'rm ~/.ssh/*',
        'rm -f ~/.ssh/id_ed25519',
        'rm -rf ~/.ssh',
        'rm -rf ~/.gnupg',
        'rm ~/.aws/credentials',
        'rm ~/.bashrc',
        'rm -f ~/.zshrc',
        'rm ~/.profile ~/.bash_profile',
        'rm "$HOME/.zshenv"',
        'rm ~/.*rc',
        'rm /home/buck/.ssh/id_rsa',
        'rm /root/.bashrc',
        'unlink /etc/resolv.conf',
        'shred -u ~/.ssh/id_rsa',
        'cd /tmp && rm /etc/passwd',
      ],
      'rm-critical',
    )
    expect(classify('rm -f /etc/passwd')?.message).toMatch(/^bash-rules: .*Hand it to the user to run\.$/)
  })

  test('the pass column', () => {
    expectAll(
      [
        'rm -f build/x',
        'rm -f /tmp/x',
        'rm -rf /tmp/build',
        'rm /var/log/app.log',
        'rm -rf /var/tmp/x',
        'rm -rf /var/cache/app',
        'rm ~/notes.txt',
        'rm -rf ~/projects/x/node_modules',
        'rm -rf ~/.cache/x',
        'rm ~/.config/app/state.json',
        'rm ~/.ssh.bak',
        'rm .bashrc',
        'rm etc/passwd',
        'rm ./usr/bin/x',
        'shred ~/.ssh/id_rsa.pub.copy',
        'echo rm /etc/passwd',
        'ls /etc/passwd',
      ],
      null,
    )
  })
})

describe('rm of critical paths', () => {
  test('rm -rf and rm -f -r of / and system paths stay rm-root; a plain rm -f of / is rm-critical', () => {
    expectAll(['rm -rf /', 'rm -f -r /etc', 'rm -rf --no-preserve-root /'], 'rm-root')
    expectAll(['rm -f /', 'rm /usr'], 'rm-critical')
    expectAll(['rm -f /tmp/x', 'rm -rf ./build', 'rm -rf /usr/local/x', 'rm /usr/local/bin/mytool'], null)
  })
})
