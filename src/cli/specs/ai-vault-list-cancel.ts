import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const AI_VAULT_LIST_CANCEL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'history', 'cancel'],
    summary: 'Cancel only an explicitly owned in-flight history-list waiter',
    usage: 'orca agent history cancel --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Strict JSON requires {requestToken,expectedRuntimeId,confirm:true}. Start agent history list with the same private UUID requestToken in its request file, and address the same selected runtime. Keep this capability private; it is excluded from receipts.',
      'Cancels only that active list waiter in the same authenticated caller scope. A missing, settled, already cancelled or differently owned token returns cancelRequested:false and exit 1. cancelRequested:true means abort requested, not shared scanner shutdown; other coalesced callers keep running. Tokens are removed when the list settles.'
    ]
  }
]
