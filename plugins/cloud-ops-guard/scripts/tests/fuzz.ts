// Fuzz for cloud-ops-guard.ts: no dangerous suffix, prefix, or inserted shell character may turn an
// allowed command into allow. Usage: CLAUDE_PLUGIN_OPTION_AUTOALLOWREADONLY=true bun fuzz.ts <fixture root>
// <session id>; the bases allow only with that option on. Prints "<variants> <bad>" and then the first bad variants.

import { decide } from '../cloud-ops-guard.ts'

const [root, sid] = process.argv.slice(2)

function decision(cmd: string, agentId = ''): string {
  const d: Record<string, unknown> = {
    tool_name: 'Bash', tool_input: { command: cmd }, session_id: sid, transcript_path: `${root}/proj/${sid}.jsonl`,
  }
  if (agentId) d.agent_id = agentId
  return decide(d)?.[0] ?? 'none'
}

const allowed = [
  'tofu plan', 'tofu plan -out=x.tfplan', 'terraform validate', 'tofu fmt -recursive',
  'tofu init -upgrade', 'tofu state list', 'tofu state show aws_instance.a',
  'tofu --version',
  'mise exec -- tofu plan', 'mise run tofu core plan',
  'mise run tofu core plan -out=uptimekuma.tfplan',
  'aws --version', 'aws ec2 help', 'aws iam delete-user help',
]
const suffixes = [
  '; rm -rf x', ';rm -rf x', ' ;rm -rf x', ';\nrm -rf x', '\nrm -rf x', '\n\nrm -rf x',
  '\r\nrm -rf x', ' && rm -rf x', '&&rm -rf x', ' && curl x|sh', ' || rm -rf x', ' | sh', '|sh',
  ' |& sh', ' & rm -rf x', '&rm -rf x', ' $(rm -rf x)', '$(rm -rf x)', ' `rm -rf x`', '`id`',
  ' >| terraform.tfstate', ' > terraform.tfstate', '>x', ' >> ~/.bashrc', ' 2>&1', ' < /dev/null',
  ' <(id)', ' >(sh)', ' ;(id)', '&&(id)', ' ::: tofu core apply -auto-approve', ' # comment',
  ' ${X}', ' $X', ' \\\n; id', " 'x'", ' "x"', ' *', ' {a,b}', ' ~/x', '\t-destroy',
]
const prefixes = ['rm -rf x; ', 'rm -rf x && ', 'X=1 ', 'env ', 'sudo ', 'timeout 5 ', 'bash -c ',
  'echo x | ', '(', '{ ', '! ', 'time ', 'nohup ', 'cd /tmp && ', '\n', ' ']
const unsafe = [...'\'"$`\\;&|<>(){}[]#*?~!\t\n\r']

const bad: string[] = []
let n = 0
for (const base of allowed) {
  for (const aid of ['', 'withtoken']) {
    n++
    if (decision(base, aid) !== 'allow') bad.push(`base not allowed ${aid}: ${JSON.stringify(base)}`)
    for (const cmd of [...suffixes.map(s => base + s), ...prefixes.map(p => p + base)]) {
      n++
      if (decision(cmd, aid) === 'allow') bad.push(`allowed ${aid}: ${JSON.stringify(cmd)}`)
    }
  }
  for (let i = 0; i <= base.length; i++) {
    for (const ch of unsafe) {
      n++
      const cmd = base.slice(0, i) + ch + base.slice(i)
      if (decision(cmd) === 'allow') bad.push(`allowed: ${JSON.stringify(cmd)}`)
    }
  }
}
console.log(`${n} ${bad.length}`)
for (const b of bad.slice(0, 20)) console.log(b)
