import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const ACTIVITY_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  'get',
  'group',
  'read',
  'compact',
  'children'
].map((operation) => ({
  path: ['ui', 'activity', operation],
  summary: 'Read or apply the existing Activity list preference',
  usage: `orca ui activity ${operation} --viewer host --surface <sidebar-agents|activity-page>${operation === 'group' ? ' --by <none|status|project|worktree|agent>' : operation === 'read' ? ' --filter <all|unread>' : operation === 'get' ? '' : ' --enabled <true|false>'} [--json]`,
  allowedFlags: [
    ...GLOBAL_FLAGS,
    'viewer',
    'surface',
    ...(operation === 'group'
      ? ['by']
      : operation === 'read'
        ? ['filter']
        : operation === 'get'
          ? []
          : ['enabled'])
  ],
  notes: [
    'The requested surface must already be visible for applied=true. Compact requires measured thread rows. Persistence acknowledges the current host preference, not a disk flush. No thread is selected or marked read.'
  ]
}))
