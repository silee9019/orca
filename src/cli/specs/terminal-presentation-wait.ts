import { GLOBAL_FLAGS, type CommandSpec } from '../args'
const NOTES = [
  'Strict JSON requires terminal, expectedPtyId, expectedIncarnationId and expectedExecutionHostId. Optional timeoutMs is 1–30000 (default 10000). Observe one future canonical event for the addressed host and exact terminal incarnation; timeout returns observed:false and exit 1.',
  'Subscriptions are removed on event, timeout, PTY exit, cancellation or disconnect. This bounded observation does not replay historical events or promise gap-free repeated polling. It does not claim viewer hydration, applied OS geometry or process death on loss of contact.'
]
export const TERMINAL_PRESENTATION_WAIT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'wait-driver'],
    summary: 'Wait for one input-driver change on an exact terminal',
    usage: 'orca terminal wait-driver --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: NOTES
  },
  {
    path: ['terminal', 'wait-fit'],
    summary: 'Wait for one fit override change on an exact terminal',
    usage: 'orca terminal wait-fit --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: NOTES
  }
]
