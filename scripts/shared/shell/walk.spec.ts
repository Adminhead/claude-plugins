import { describe, expect, test } from 'bun:test'
import { nestedScript, parse } from './walk.ts'

const script = (cmd: string): string | null => nestedScript(parse(cmd).commands[0].argv)

describe('nestedScript: multi-call binaries and fish', () => {
  test('busybox sh, ash, bash and hush and toybox sh, toysh and bash read -c as sh does', () => {
    expect(script("busybox sh -c 'rm -rf /'")).toBe('rm -rf /')
    for (const c of ["busybox ash -c 'X'", "busybox bash -c 'X'", "busybox hush -c 'X'", "/bin/busybox sh -ec 'X'",
      "busybox /bin/sh -c 'X'", "toybox sh -c 'X'", "toybox toysh -c 'X'", "toybox bash -c 'X'", "busybox sh -o pipefail -c 'X'", "busybox sh -x -c 'X' arg0"]) {
      expect(script(c)).toBe('X')
    }
  })

  test('busybox and toybox give null for other applets, no -c, or an unknown applet', () => {
    for (const c of ["busybox rm -c 'X'", "busybox -c 'X'", 'busybox sh script.sh', 'busybox sh', "toybox ash -c 'X'",
      'busybox "$x" -c y', "busybox sh -c \"$x\"", 'busybox']) {
      expect(script(c)).toBeNull()
    }
  })

  test('fish -c, bundled, long and abbreviated forms', () => {
    for (const c of ["fish -c 'X'", "/usr/bin/fish -lc 'X'", "fish -cX", "fish --command 'X'", "fish --command='X'",
      "fish --comm 'X'", "fish -i -c 'X' a b", "fish -d 3 -c 'X'", "fish --debug=3 -c 'X'"]) {
      expect(script(c)).toBe('X')
    }
  })

  test('fish with more than one command text gives null, since each is parsed alone', () => {
    for (const c of ["fish -C 'echo i' -c 'rm -rf ~'", "fish -c 'ls' -c 'rm -rf ~'", "fish --init-command='a' --command 'b'",
      "fish -N -c 'echo \\' -c 'kubectl --context prod delete ns example'"]) {
      expect(script(c)).toBeNull()
    }
  })

  test('fish text that sh would read differently gives null', () => {
    for (const c of [
      // fish takes \' inside single quotes and decodes \xNN.
      `fish -c "echo 'a\\'' ; kubectl --context prod delete ns prod ; echo '' \\'"`,
      "fish -N -c 'kubectl --context \\x70rod delete ns example'",
      "fish -N -c 'set K kubectl; $K --context prod delete ns example'",
      "fish -c 'echo (kubectl delete ns prod)'", "fish -c 'echo {a,b}'", "fish -c 'echo `x`'",
      "fish -c 'true; and kubectl delete ns prod'", "fish -c 'false; or rm -rf ~'", "fish -c 'not true'",
      "fish -c 'begin; rm -rf ~; end'", "fish -c 'alias k kubectl; k delete ns prod'",
      "fish -c 'set -x KUBECONFIG prod.yaml; kubectl delete ns x'", "fish -c 'echo \"and\"'",
      // fish pipes an fd with `>|`; sh reads a clobber redirect to a file.
      "fish -c 'echo x >| kubectl --context prod delete ns prod'",
      "fish -c 'echo x 2>| kubectl --context prod delete ns prod'",
    ]) {
      expect(script(c)).toBeNull()
    }
    expect(script("fish -c 'kubectl get pods | grep x && echo ok; ls > /tmp/f'")).toBe('kubectl get pods | grep x && echo ok; ls > /tmp/f')
  })

  test('fish gives null without -c, after an operand, or on a word it cannot read', () => {
    for (const c of ['fish', 'fish script.fish', "fish script.fish -c 'X'", "fish -- -c 'X'", "fish -C 'X'", 'fish -c',
      'fish -c "$x"', "fish \"$o\" -c 'X'", "fish --p 'X'", "fish --bogus -c 'X'",
      // fish rejects a -c with no value and runs nothing.
      "fish -c 'X' -c"]) {
      expect(script(c)).toBeNull()
    }
  })

  test('the sh forms are unchanged', () => {
    expect(script("bash -lc 'X'")).toBe('X')
    for (const c of ["bash -- -c 'X'", 'sudo bash -c x', 'ls -c x', 'bash script.sh']) expect(script(c)).toBeNull()
  })
})
