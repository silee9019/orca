import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const WORKSPACE_LIST_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'workspace-list', 'get'],
    aliases: [['ui', 'workspace-list', 'show']],
    summary: 'Read workspace list preferences and committed rows',
    usage: 'orca ui workspace-list get --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['ui', 'workspace-list', 'group'],
    summary: 'Apply the existing workspace list preference',
    usage: 'orca ui workspace-list group --viewer host --by <mode> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'by'],
    notes: [
      'Group: none|workspace-status|repo|pr-status, including collapse reset. Sort: name|smart|recent|repo|manual. Project order: manual|recent, available only in repo grouping.',
      'Persisted confirms the current host preference value. Sort write outcome and execution-host metadata persistence remain unknown. Rendered rows are the committed logical model, not the count of virtual DOM cards. No disk-flush guarantee.'
    ]
  },
  {
    path: ['ui', 'workspace-list', 'sort'],
    summary: 'Apply the existing workspace list preference',
    usage: 'orca ui workspace-list sort --viewer host --by <mode> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'by'],
    notes: [
      'Group: none|workspace-status|repo|pr-status, including collapse reset. Sort: name|smart|recent|repo|manual. Project order: manual|recent, available only in repo grouping.',
      'Persisted confirms the current host preference value. Sort write outcome and execution-host metadata persistence remain unknown. Rendered rows are the committed logical model, not the count of virtual DOM cards. No disk-flush guarantee.'
    ]
  },
  {
    path: ['ui', 'workspace-list', 'project-order'],
    summary: 'Apply the existing workspace list preference',
    usage: 'orca ui workspace-list project-order --viewer host --by <mode> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'by'],
    notes: [
      'Group: none|workspace-status|repo|pr-status, including collapse reset. Sort: name|smart|recent|repo|manual. Project order: manual|recent, available only in repo grouping.',
      'Persisted confirms the current host preference value. Sort write outcome and execution-host metadata persistence remain unknown. Rendered rows are the committed logical model, not the count of virtual DOM cards. No disk-flush guarantee.'
    ]
  },
  {
    path: ['ui', 'workspace-list', 'group-toggle'],
    summary: 'Collapse or expand one workspace list section through the existing list toggle',
    usage: 'orca ui workspace-list group-toggle --viewer host --group-key <key> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'group-key'],
    notes: [
      'Keys come from rendered.collapsibleKeys of ui workspace-list get: every section header, host headers and parent workspaces with children. Unpublished keys are rejected before any change.',
      'The call flips the current state, so after a timeout read collapsedGroups before repeating it. Persisted confirms the host preference holds the toggled set. Write outcome stays unknown because the existing toggle does not report its write. Rendered rows are the committed logical model.'
    ]
  }
]
