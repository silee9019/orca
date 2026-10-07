import { GLOBAL_FLAGS, type CommandSpec } from '../args'

const notes = [
  '--viewer host explicitly selects the selected runtime’s own desktop window. Headless runtimes and viewers displaying another runtime refuse the request.',
  'Use --environment to select the owning runtime; SSH execution does not change the viewer owner. Project IDs come from repo list on that runtime.',
  'set replaces the project selection; clear removes only the project filter. Other filters remain active.',
  'The durable project filter follows existing shared UI-state policy; this is not private viewer state.',
  'persisted confirms storage read-back; applied confirms the committed sidebar list. A hidden/unmounted sidebar or concurrent change can leave applied false. Inspect both acknowledgements.',
  'Old runtimes refuse this new method without falling back to local UI state.'
]

export const PROJECT_FILTER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'project-filter', 'get'],
    summary: 'Read the project filter and rendered list of the selected host viewer',
    usage: 'orca ui project-filter get --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes
  },
  {
    path: ['ui', 'project-filter', 'set'],
    summary: 'Replace the project filter in the selected host viewer',
    usage: 'orca ui project-filter set --viewer host --repo <id> [--repo <id> ...] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'repo'],
    repeatableFlags: ['repo'],
    notes
  },
  {
    path: ['ui', 'project-filter', 'clear'],
    summary: 'Clear only the project filter in the selected host viewer',
    usage: 'orca ui project-filter clear --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes
  }
]
