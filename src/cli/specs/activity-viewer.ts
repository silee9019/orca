import { GLOBAL_FLAGS, type CommandSpec } from '../args'

function options(operation: string): { flags: string[]; usage: string } {
  switch (operation) {
    case 'group':
      return { flags: ['by'], usage: ' --by <none|status|project|worktree|agent>' }
    case 'read':
      return { flags: ['filter'], usage: ' --filter <all|unread>' }
    case 'origin':
      return {
        flags: ['kind', 'hidden'],
        usage: ' --kind <cli|automation|other-client> --hidden <true|false>'
      }
    case 'host-toggle':
      return { flags: ['host'], usage: ' --host <execution-host-id>' }
    case 'search':
      return { flags: ['query'], usage: ' --query <text>' }
    case 'compact':
    case 'children':
    case 'search-visible':
      return { flags: ['enabled'], usage: ' --enabled <true|false>' }
    default:
      return { flags: [], usage: '' }
  }
}
export const ACTIVITY_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  'get',
  'mark-all-read',
  'group',
  'read',
  'compact',
  'children',
  'origin',
  'scope-reset',
  'host-toggle',
  'hosts-toggle-all',
  'search',
  'search-clear',
  'search-visible'
].map((operation) => ({
  path: ['ui', 'activity', operation],
  summary: 'Read or apply an existing Activity list control',
  usage: `orca ui activity ${operation} --viewer host --surface ${operation === 'search-visible' ? 'sidebar-agents' : operation === 'search-clear' ? 'activity-page' : '<sidebar-agents|activity-page>'}${options(operation).usage} [--json]`,
  allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'surface', ...options(operation).flags],
  notes: [
    'Search-clear clicks the visible page clear button and focuses its input. Search changes only the requested surface local query and requires its visible input. Search-visible is sidebar-only; showing focuses the input and hiding clears its query.',
    'Origin uses the existing other-client availability gate. Host toggles use the current host catalog and preserve the last selected host. Scope-reset clears host and project scope together, preserving origin/read/search preferences.',
    'Mark-all-read uses the existing badge-coherent unread set, including threads hidden by search or scope. A disabled control is a no-op. Its renderer acknowledgement does not claim durable persistence.',
    'The requested surface must already be visible for applied=true. Compact requires measured thread rows. Preference persistence acknowledges the current host preference, not a disk flush.'
  ]
}))
