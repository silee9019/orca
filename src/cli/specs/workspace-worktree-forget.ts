import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_WORKTREE_FORGET_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['worktree', 'forget-desktop'],
    summary: 'Forget workspace metadata through the desktop owner without deleting its files',
    usage: 'orca worktree forget-desktop --params-file <file|-> --confirm <worktreeId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {worktreeId, hostId, expectedExecutionHostId:"local"}. Requires a full worktree ID and explicit hostId. Uses the original desktop forget service, including host-qualified removal ownership, same-ID preservation, in-flight removal coordination and folder-project root protection.',
      'Attempts the original terminal/structured-session teardown, then retires workspace metadata and transient state. Does not remove the checkout directory or delete Git branches. The original service continues metadata retirement even when process teardown fails.',
      'Returns forgotten:true for metadata retirement and executionVerdict:"unverifiable" because the original forget contract provides no positive host proof that all processes exited. An acknowledgement, timeout, disconnected host or missing metadata does not prove process death. Check the owning host before recreating work.',
      'The selected desktop controls the operation; SSH/runtime targets retain their existing execution boundaries. No client or local-host substitution. Node hosts without the desktop service and old peers fail explicitly. Transport timeout does not cancel or roll back the operation.'
    ]
  }
]
