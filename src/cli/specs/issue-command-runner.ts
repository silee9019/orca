import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const ISSUE_COMMAND_RUNNER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'issue-runner'],
    summary:
      'Create the addressed Git workspace’s canonical issue command runner without executing it',
    usage: 'orca agent hooks issue-runner --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Requires {worktree,command,confirm:true}. Writes or replaces the existing issue-command runner in the resolved Git directory. Command text is private input and is not returned. Launch metadata includes paths and environment variables; no terminal is started.',
      'Uses the execution host’s canonical shell and project runtime resolution. Folder, SSH and nested paired-host workspaces are refused; address a paired host directly for its local workspaces. Native Windows runner format follows the script shebang, not the terminal shell preference.'
    ]
  }
]
