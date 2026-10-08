import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_INTEGRATION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['jira', 'connect'],
    summary: 'Jira connect on the selected host',
    usage: 'orca jira connect --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'The selected Orca host owns credentials. Real account connection requires a credential file supplied by the user; credentials are never accepted as inline command arguments.',
      'Input JSON uses Connect in jira-params. Use --params-file - for stdin.',
      'Only success is printed. Provider error text and credential-bearing response fields are withheld. Check connection-status (Linear) or status (Jira) after connecting.'
    ]
  },
  {
    path: ['linear', 'connect'],
    summary: 'Linear connect on the selected host',
    usage: 'orca linear connect --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'The selected Orca host owns credentials. Real account connection requires a credential file supplied by the user; credentials are never accepted as inline command arguments.',
      'Input JSON uses Connect in linear-params. Use --params-file - for stdin.',
      'Only success is printed. Provider error text and credential-bearing response fields are withheld. Check connection-status (Linear) or status (Jira) after connecting.'
    ]
  },
  {
    path: ['jira', 'disconnect'],
    summary: 'Jira disconnect on the selected host',
    usage: 'orca jira disconnect --params-file <file|-> --confirm <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: siteId.',
      'The selected Orca host owns credentials. Real account connection requires a credential file supplied by the user; credentials are never accepted as inline command arguments.',
      'Input JSON uses SelectSite in jira-params. Use --params-file - for stdin.',
      '--confirm must exactly match the concrete siteId or workspaceId in the input.'
    ],
    destructive: true
  },
  {
    path: ['linear', 'disconnect'],
    summary: 'Linear disconnect on the selected host',
    usage: 'orca linear disconnect --params-file <file|-> --confirm <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: workspaceId.',
      'The selected Orca host owns credentials. Real account connection requires a credential file supplied by the user; credentials are never accepted as inline command arguments.',
      'Input JSON uses SelectWorkspace in linear-params. Use --params-file - for stdin.',
      '--confirm must exactly match the concrete siteId or workspaceId in the input.'
    ],
    destructive: true
  },
  {
    path: ['jira', 'select-site'],
    summary: 'Jira select site on the selected host',
    usage: 'orca jira select-site --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: siteId.',
      'The selected Orca host owns credentials. Real account connection requires a credential file supplied by the user; credentials are never accepted as inline command arguments.',
      'Input JSON uses SelectSite in jira-params. Use --params-file - for stdin.'
    ]
  },
  {
    path: ['linear', 'select-workspace'],
    summary: 'Linear select workspace on the selected host',
    usage: 'orca linear select-workspace --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: workspaceId.',
      'The selected Orca host owns credentials. Real account connection requires a credential file supplied by the user; credentials are never accepted as inline command arguments.',
      'Input JSON uses SelectWorkspace in linear-params. Use --params-file - for stdin.'
    ]
  },
  {
    path: ['linear', 'connection-status'],
    summary: 'Linear connection status on the selected host',
    usage: 'orca linear connection-status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'The selected Orca host owns credentials. Real account connection requires a credential file supplied by the user; credentials are never accepted as inline command arguments.'
    ]
  },
  {
    path: ['linear', 'test-connection'],
    summary: 'Linear test connection on the selected host',
    usage: 'orca linear test-connection --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: workspaceId.',
      'The selected Orca host owns credentials. Real account connection requires a credential file supplied by the user; credentials are never accepted as inline command arguments.',
      'Input JSON uses SelectWorkspace in linear-params. Use --params-file - for stdin.'
    ]
  }
]
