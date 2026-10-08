import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const REQUEST_FLAGS = [...GLOBAL_FLAGS, 'request-file']

export const AGENT_STATUS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'status', 'retire-tab'],
    summary: 'Retire canonical status and authority for one explicitly confirmed tab',
    usage: 'orca agent status retire-tab --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Requires {tabId, confirm:true, observedRows:[{paneKey,receivedAt,stateStartedAt}]}. A changed set is refused. This does not close the tab or stop processes.'
    ]
  },
  {
    path: ['agent', 'status', 'list'],
    summary: 'Read canonical agent status metadata without prompts or launch credentials',
    usage: 'orca agent status list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent', 'status', 'migration'],
    summary: 'Read panes whose legacy identity could not be migrated',
    usage: 'orca agent status migration [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent', 'status', 'dismiss'],
    summary: 'Dismiss one observed status row without ending its process',
    usage: 'orca agent status dismiss --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Requires paneKey, receivedAt and stateStartedAt from agent status list. A changed row is refused; this action never infers process exit.'
    ]
  },
  {
    path: ['agent', 'status', 'infer-interrupt'],
    summary: 'Apply the canonical interrupt inference to an observed status baseline',
    usage: 'orca agent status infer-interrupt --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Requires the observed baseline and intent. This updates status only; it does not send a key or stop a process.'
    ]
  },
  {
    path: ['agent', 'status', 'infer-question-answered'],
    summary: 'Apply canonical answered-question inference to an observed status baseline',
    usage: 'orca agent status infer-question-answered --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Requires the observed baseline. This updates status only; it does not answer an interactive prompt.'
    ]
  }
]
