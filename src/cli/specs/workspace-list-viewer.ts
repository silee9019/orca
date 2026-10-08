import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const WORKSPACE_LIST_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'workspace-list', 'get'],
    summary: 'Read workspace list preferences and committed rows',
    usage: 'orca ui workspace-list get --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  ...['group', 'sort', 'project-order'].map((operation) => ({
    path: ['ui', 'workspace-list', operation],
    summary: 'Apply the existing workspace list preference',
    usage: `orca ui workspace-list ${operation} --viewer host --by <mode> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'by'],
    notes: [
      'Group: none|workspace-status|repo|pr-status, including collapse reset. Sort: name|smart|recent|repo|manual. Project order: manual|recent, available only in repo grouping.',
      'Persisted confirms the current host preference value. Sort write outcome and execution-host metadata persistence remain unknown. Rendered rows are the committed logical model, not the count of virtual DOM cards. No disk-flush guarantee.'
    ]
  }))
]
