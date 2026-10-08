import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const SEARCH_SETTINGS_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['search', 'viewer'],
    summary: 'Use session search settings in the explicitly selected host viewer',
    usage:
      'orca search viewer --viewer host --operation <action> [--target-host runtime:<id>] [--confirm <target>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'operation', 'target-host', 'confirm'],
    notes: [
      'Actions: local-toggle, server-toggle, enable-all, server-settings-open, list-toggle.',
      'local-toggle requires --confirm local. server-toggle requires --target-host runtime:<id> and matching --confirm. enable-all requires --confirm all-computers and uses only the computers currently offered by the settings owner.',
      'An unavailable, busy, web or old viewer fails explicitly. The native window is never revealed or activated. A timeout leaves the effect unknown.'
    ]
  }
]
