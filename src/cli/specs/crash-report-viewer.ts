import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const CRASH_REPORT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'crash-report', 'open'],
    summary: 'Open the existing crash report in the host viewer',
    usage: 'orca ui crash-report open --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes: [
      'Uses Help > Report Crash without activating a native window. Rejects existing dialogs and unsaved settings. Completion means the dialog and report dialog controls rendered; report reads, account lookup, copying, dismissal, diagnostic bundles and report submission have separate outcomes.'
    ]
  }
]
