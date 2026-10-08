import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_BRANCH_RENAME_FAILURE_SPECS: CommandSpec[] = [
  {
    path: ['worktree', 'branch-rename-failure'],
    summary: 'Save the last automatic branch rename failure output of a workspace to a new file',
    usage:
      'orca worktree branch-rename-failure --params-file <file|-> --output-file <new-file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'output-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local", worktreeId}. Reads the same in-memory on-demand diagnostic the desktop failure dialog shows (sanitized head/tail of the agent CLI output). It is never persisted, so a desktop restart discards it.',
      'Served only to the local socket caller of the desktop host; paired, mobile, WebSocket and federated callers are refused because the output can identify the local environment. The text is written only to the new --output-file (mode 0600, exclusive create); stdout holds found, outputPath and bytes. Existing files and symbolic links are never overwritten.',
      'found:false means no failure output is held now and creates no file; it does not prove that no rename failed. Node hosts without the desktop service and old peers fail explicitly.'
    ]
  }
]
