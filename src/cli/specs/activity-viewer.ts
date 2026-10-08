import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const ACTIVITY_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  'get',
  'group',
  'read',
  'compact',
  'children',
  'search',
  'search-clear',
  'search-visible'
].map((operation) => ({
  path: ['ui', 'activity', operation],
  summary: 'Read or apply an existing Activity list control',
  usage: `orca ui activity ${operation} --viewer host --surface ${operation === 'search-visible' ? 'sidebar-agents' : operation === 'search-clear' ? 'activity-page' : '<sidebar-agents|activity-page>'}${operation === 'group' ? ' --by <none|status|project|worktree|agent>' : operation === 'read' ? ' --filter <all|unread>' : operation === 'get' || operation === 'search-clear' ? '' : operation === 'search' ? ' --query <text>' : ' --enabled <true|false>'} [--json]`,
  allowedFlags: [
    ...GLOBAL_FLAGS,
    'viewer',
    'surface',
    ...(operation === 'group'
      ? ['by']
      : operation === 'read'
        ? ['filter']
        : operation === 'search'
          ? ['query']
          : operation === 'get' || operation === 'search-clear'
            ? []
            : ['enabled'])
  ],
  notes: [
    'Search-clear clicks the visible page clear button and focuses its input. Search changes only the requested surface local query and requires its visible input. Search-visible is sidebar-only; showing focuses the input and hiding clears its query.',
    'The requested surface must already be visible for applied=true. Compact requires measured thread rows. Persistence acknowledges the current host preference, not a disk flush. No thread is selected or marked read.'
  ]
}))
