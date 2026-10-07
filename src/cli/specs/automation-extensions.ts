import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const AUTOMATION_EXTENSION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['automations', 'external', 'list'],
    summary: 'external list through the owning automation service',
    usage: 'orca automations external list --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'External manager requests require a captured desktop owner with the exact SSH registration generation; runtime authorities are refused by the existing owner guard.',
      'Precheck takes exact automation and scheduled run IDs. A null result means that run has no scheduled precheck.',
      'The runtime owns execution. A disconnected SSH host is never replaced by local execution.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['automations', 'external', 'runs'],
    summary: 'external runs through the owning automation service',
    usage: 'orca automations external runs --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'External manager requests require a captured desktop owner with the exact SSH registration generation; runtime authorities are refused by the existing owner guard.',
      'Precheck takes exact automation and scheduled run IDs. A null result means that run has no scheduled precheck.',
      'The runtime owns execution. A disconnected SSH host is never replaced by local execution.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['automations', 'external', 'create'],
    summary: 'external create through the owning automation service',
    usage: 'orca automations external create --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'External manager requests require a captured desktop owner with the exact SSH registration generation; runtime authorities are refused by the existing owner guard.',
      'Precheck takes exact automation and scheduled run IDs. A null result means that run has no scheduled precheck.',
      'The runtime owns execution. A disconnected SSH host is never replaced by local execution.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['automations', 'external', 'update'],
    summary: 'external update through the owning automation service',
    usage: 'orca automations external update --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'External manager requests require a captured desktop owner with the exact SSH registration generation; runtime authorities are refused by the existing owner guard.',
      'Precheck takes exact automation and scheduled run IDs. A null result means that run has no scheduled precheck.',
      'The runtime owns execution. A disconnected SSH host is never replaced by local execution.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['automations', 'external', 'action'],
    summary: 'external action through the owning automation service',
    usage: 'orca automations external action --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'External manager requests require a captured desktop owner with the exact SSH registration generation; runtime authorities are refused by the existing owner guard.',
      'Precheck takes exact automation and scheduled run IDs. A null result means that run has no scheduled precheck.',
      'The runtime owns execution. A disconnected SSH host is never replaced by local execution.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['automations', 'precheck'],
    summary: 'precheck through the owning automation service',
    usage: 'orca automations precheck --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'External manager requests require a captured desktop owner with the exact SSH registration generation; runtime authorities are refused by the existing owner guard.',
      'Precheck takes exact automation and scheduled run IDs. A null result means that run has no scheduled precheck.',
      'The runtime owns execution. A disconnected SSH host is never replaced by local execution.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['automations', 'snapshot-name'],
    summary: 'snapshot-name through the owning automation service',
    usage: 'orca automations snapshot-name --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'External manager requests require a captured desktop owner with the exact SSH registration generation; runtime authorities are refused by the existing owner guard.',
      'Precheck takes exact automation and scheduled run IDs. A null result means that run has no scheduled precheck.',
      'The runtime owns execution. A disconnected SSH host is never replaced by local execution.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  }
]
