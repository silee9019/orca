import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const FEATURE_TOUR_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'feature-tour', 'open'],
    summary: 'Open the existing feature tour in the host viewer',
    usage: 'orca ui feature-tour open --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes: [
      'Uses Help > Explore Orca without activating a native window. Rejects existing dialogs and unsaved settings. Completion means the dialog and tour content rendered; media, passive completion storage and provider readiness have separate outcomes.'
    ]
  }
]
