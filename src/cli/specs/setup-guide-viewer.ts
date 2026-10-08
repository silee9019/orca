import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const SETUP_GUIDE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'setup-guide', 'open'],
    summary: 'Open the existing setup guide in the host viewer',
    usage: 'orca ui setup-guide open --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes: [
      'Uses Help > Getting Started without activating a native window. Rejects existing dialogs and unsaved settings. Completion means the dialog and current checklist content rendered; media, passive completion storage and provider readiness have separate outcomes.'
    ]
  }
]
