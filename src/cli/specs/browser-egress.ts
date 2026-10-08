import { GLOBAL_FLAGS, type CommandSpec } from '../args'
const allowedFlags = [
  ...GLOBAL_FLAGS,
  'viewer',
  'page',
  'worktree',
  'placement',
  'execution-host',
  'egress',
  'runtime-environment',
  'remote-page',
  'browser-host-client',
  'browser-host-generation',
  'page-host-generation'
]
export const BROWSER_EGRESS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'egress', 'open'],
    summary: 'Open the current egress popover',
    usage:
      'orca browser egress open --viewer host --page <page> --worktree <workspace> --placement <ssh|client|streamed> [--execution-host <ssh:target> --egress <ssh|local>] [--runtime-environment <environment> --remote-page <page>] [--browser-host-client <client> --browser-host-generation <generation> --page-host-generation <generation>] [--json]',
    allowedFlags
  },
  {
    path: ['browser', 'egress', 'close'],
    summary: 'Close the current egress popover',
    usage:
      'orca browser egress close --viewer host --page <page> --worktree <workspace> --placement <ssh|client|streamed> [--execution-host <ssh:target> --egress <ssh|local>] [--runtime-environment <environment> --remote-page <page>] [--browser-host-client <client> --browser-host-generation <generation> --page-host-generation <generation>] [--json]',
    allowedFlags
  },
  {
    path: ['browser', 'egress', 'settings'],
    summary: 'Open existing browser routing settings',
    usage:
      'orca browser egress settings --viewer host --page <page> --worktree <workspace> --placement <ssh|client|streamed> [--execution-host <ssh:target> --egress <ssh|local>] [--runtime-environment <environment> --remote-page <page>] [--browser-host-client <client> --browser-host-generation <generation> --page-host-generation <generation>] [--json]',
    allowedFlags
  },
  {
    path: ['browser', 'egress', 'status'],
    summary: 'Read current egress popover state',
    usage:
      'orca browser egress status --viewer host --page <page> --worktree <workspace> --placement <ssh|client|streamed> [--execution-host <ssh:target> --egress <ssh|local>] [--runtime-environment <environment> --remote-page <page>] [--browser-host-client <client> --browser-host-generation <generation> --page-host-generation <generation>] [--json]',
    allowedFlags
  }
]
