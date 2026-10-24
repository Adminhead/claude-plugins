import { describe, expect, test } from 'bun:test'
import { nestedScript, parse } from './walk.ts'

const script = (cmd: string): string | null => nestedScript(parse(cmd).commands[0].argv)

describe('nestedScript: multi-call binaries and fish', () => {
  test('busybox sh, ash and bash and toybox sh read -c as sh does', () => {
    expect(script("busybox sh -c 'rm -rf /'")).toBe('rm -rf /')
    for (const c of ["busybox ash -c 'X'", "busybox bash -c 'X'", "/bin/busybox sh -ec 'X'", "busybox /bin/sh -c 'X'",
      "toybox sh -c 'X'", "busybox sh -o pipefail -c 'X'", "busybox sh -x -c 'X' arg0"]) {
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

  test('fish runs every -c, after its -C init commands', () => {
    expect(script("fish -C 'set x 1' -c 'rm -rf ~'")).toBe('set x 1\nrm -rf ~')
    expect(script("fish -c 'ls' -c 'rm -rf ~'")).toBe('ls\nrm -rf ~')
    expect(script("fish --init-command='a' --command 'b'")).toBe('a\nb')
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
