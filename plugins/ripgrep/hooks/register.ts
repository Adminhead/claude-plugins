import type { Register } from 'claude-code'

const GUIDELINES = `## Code Search Guidelines
- Always prefer the built-in \`Grep\` tool or explicit \`rg\` commands over traditional \`grep\`.
- Do not use \`grep -r\` or \`find | xargs grep\`; \`rg\` respects \`.gitignore\`, \`.ignore\`, and hidden-file rules by default.
- For flag details and output-bounding patterns, load the \`ripgrep:ripgrep\` skill.`

export const register: Register = on => {
  // Append after core blocks so claudeMd and the rest stay intact.
  on('prompt.context', async ($, e, next) => {
    const r = await next(e)
    return { ...r, blocks: [...r.blocks, { name: 'codeSearch', text: GUIDELINES }] }
  })
}
