import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const WORKSPACE_PORT_OPEN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'port-open'],
    summary: 'Open a scanned port through its exact visible host Ports panel owner',
    usage:
      'orca browser port-open --viewer host --execution-host <local|runtime:id|ssh:id> --worktree <id> --port-id <scan-id> --intent <saved|system> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'execution-host', 'worktree', 'port-id', 'intent'],
    notes: [
      'Saved uses the current open-links setting. System carries the original pointer modifier intent; paired hosts preserve their remote-browser policy. Direct SSH owners remain unavailable. No port scanning or OS input is synthesized.'
    ]
  }
]
