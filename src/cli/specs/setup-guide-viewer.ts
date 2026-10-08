import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const SETUP_GUIDE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'setup-guide', 'hide-sidebar'],
    summary: 'Use the open Help guide to hide its sidebar checklist',
    usage: 'orca ui setup-guide hide-sidebar --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes: [
      'Requires the original visible hide button in the open Help guide. Keeps its current step and dialog open. Completion reports optimistic dismissal only; host write and disk persistence remain unverified.'
    ]
  },
  {
    path: ['ui', 'setup-guide', 'select-step'],
    summary: 'Select an original checklist step in the open Help setup guide',
    usage: 'orca ui setup-guide select-step --step <step-id> --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'step'],
    notes: [
      'Requires the existing Help setup guide. Uses its original row once, including same-step selection. Completion means the selected content rendered, not installation, permission, service or storage success.'
    ]
  },
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
