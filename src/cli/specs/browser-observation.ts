import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_OBSERVATION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'observe'],
    summary: 'Read host viewer automation visibility from its active IPC bridge',
    usage:
      'orca browser observe --viewer host --page <page> --worktree <workspace> [--wait-ms <0..5000>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'worktree', 'wait-ms'],
    notes: [
      'Reads existing activation/capture visibility. A bounded wait returns the first value change or an unchanged snapshot. Requires the local native page and active renderer bridge; remote execution and old peers fail explicitly.'
    ]
  },
  {
    path: ['runtime', 'browser-observe'],
    summary: 'Read the hydrated browser input driver from the host viewer IPC bridge',
    usage:
      'orca runtime browser-observe --viewer host --page <page> --worktree <workspace> [--wait-ms <0..5000>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'worktree', 'wait-ms'],
    notes: [
      'Reads the existing driver store after its successful IPC snapshot hydration. Waits at most five seconds for a value change; reports neither process status nor navigation completion.'
    ]
  }
]
