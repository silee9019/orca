import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_PALETTE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'palette-select'],
    summary: 'Select an exact browser page through the host Palette owner',
    usage:
      'orca browser palette-select --viewer host --execution-host <local|ssh:id|runtime:id> --worktree <id> --workspace <id> --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'execution-host', 'worktree', 'workspace', 'page'],
    notes: [
      'Opens the Palette when no other modal is active, reuses its selection callback, and acknowledges page activation, modal close, and actual page chrome focus. The viewer remains local; the selected workspace may belong to an execution host.'
    ]
  }
]
