import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const WORKSPACE_FILE_OPEN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'file-open'],
    summary: 'Open an exact mounted file explorer row through its existing context callback',
    usage:
      'orca browser file-open --viewer host --execution-host <local|ssh:id|runtime:id> --worktree <id> --file <visible-file-path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'execution-host', 'worktree', 'file'],
    notes: [
      'Requires one mounted matching explorer row whose current file action is enabled and whose source owner matches the execution host. Local files retain the browser-tab route; SSH and paired files retain workspace-document preview. A page receipt acknowledges selection, not file-content loading.'
    ]
  }
]
