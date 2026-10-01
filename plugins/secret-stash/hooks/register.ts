import type { Register } from 'claude-code'
import { registerInbound } from './inbound.ts'
import { registerOutbound } from './outbound.ts'

export const register: Register = (on, options) => {
  registerOutbound(on, options)
  registerInbound(on, options)
}
