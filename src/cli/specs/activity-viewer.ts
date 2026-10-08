import { GLOBAL_FLAGS, type CommandSpec } from '../args'

function options(operation: string): { flags: string[]; usage: string } {
  switch (operation) {
    case 'preview-edit':
      return { flags: ['pane', 'field'], usage: ' --pane <pane-key> --field <issue|comment>' }
    case 'context-menu':
    case 'preview-review-menu':
    case 'preview-issue-menu':
    case 'preview':
      return { flags: ['pane', 'enabled'], usage: ' --pane <pane-key> --enabled <true|false>' }
    case 'copy':
      return { flags: ['pane', 'kind'], usage: ' --pane <pane-key> --kind <title|path>' }
    case 'preview-copy-issue-link':
    case 'preview-copy-path':
    case 'read-toggle':
    case 'clear-thread':
    case 'jump':
    case 'select':
      return { flags: ['pane'], usage: ' --pane <pane-key>' }
    case 'read-toggle-many':
    case 'clear-threads':
      return { flags: ['panes'], usage: ' --panes <json-pane-key-array>' }
    case 'scroll':
      return { flags: ['top'], usage: ' --top <pixels>' }
    case 'resize':
      return { flags: ['width'], usage: ' --width <pixels>' }
    case 'group-toggle':
      return { flags: ['group-key'], usage: ' --group-key <group-key>' }
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
function activityOptions(operation: string): Omit<CommandSpec, 'path'> {
  return {
    summary: 'Read or apply an existing Activity list control',
    usage: `orca ui activity ${operation} --viewer host --surface ${operation === 'search-visible' ? 'sidebar-agents' : operation === 'search-clear' || operation === 'close' || operation === 'resize' ? 'activity-page' : '<sidebar-agents|activity-page>'}${options(operation).usage} [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'surface', ...options(operation).flags],
    notes: [
      'Preview-copy-issue-link requires the exact open issue menu and its visible Copy link item. It calls the original hover callback once, preserving hover/menu close and copy toast. The clipboard write acknowledgement and read-back are local; the URL is never returned and a timed-out write cannot be cancelled.',
      'Preview-review-menu uses the original visible PR or MR more-actions trigger and local pending-hover-close policy. Applied confirms the exact menu portal or its removal. Provider and unlink-only gates stay unchanged; no menu item is selected.',
      'Preview-issue-menu uses the original visible more-actions trigger and local pending-hover-close policy. Applied confirms its exact menu portal or its removal. It never opens a preview implicitly, selects a menu item, or acknowledges remote work.',
      'Preview-edit clicks the original visible issue or notes action once and never overwrites an open modal. Applied confirms the resolved local dialog owner, committed original seed and requested input focus (or its original disabled state). It does not save, close the preview explicitly, or acknowledge remote writes.',
      'Preview-copy-path requires the exact open preview and its visible path action. It preserves the original path-only gate and success/error toast. Its clipboard acknowledgement/read-back has the same timeout limits as Copy; it never opens the preview implicitly.',
      'Preview sends one mouse enter or leave through the original visible thread trigger and waits for its exact portal. Original delays, context-menu suppression, and pending menu close are preserved. This confirms only the local preview shell, not metadata readiness or remote acknowledgement.',
      'Copy uses the original single-thread menu title/path target and workspace availability gate. The text stays in the host viewer clipboard; the reply reports write acknowledgement and read-back verification separately (a timeout can leave an uncancelled write in flight) without printing it. No durable preference or remote activation acknowledgement is implied.',
      'Scroll moves the original surface scroll container once. Target is clamped to the extent at dispatch. Applied requires its native scroll acknowledgement and actual viewport-intersecting rows, excluding overscan. Sidebar offset memory uses the existing local ref; no durable persistence is claimed.',
      'Resize uses the original page list drag and its 320–720 pixel clamp. Applied requires its actual visible width and drag cleanup; local width is not durable persistence.',
      'Close clicks the original page back button once and restores its saved previous view. Applied confirms the local page entry commit and, for a resident terminal workspace, its visible workspace and resolved host. Creation panels remain unverified; no content readiness or remote acknowledgement is implied.',
      'Group-toggle uses the requested surface original collapse control. Applied requires its visible group header and matching logical rows; the local collapse state does not claim durable persistence.',
      'Select invokes the original open action once. Closed retained tabs report workspace-only with applied=false. Terminal arrival requires the exact visible leaf and its input focus; structured arrival reports local content state, never a remote activation acknowledgement.',
      'Jump uses the original workspace action and read acknowledgement. Applied confirms the visible destination workspace and its resolved host, not terminal readiness or a remote activation acknowledgement.',
      'Search-clear clicks the visible page clear button and focuses its input. Search changes only the requested surface local query and requires its visible input. Search-visible is sidebar-only; showing focuses the input and hiding clears its query.',
      'Origin uses the existing other-client availability gate. Host toggles use the current host catalog and preserve the last selected host. Scope-reset clears host and project scope together, preserving origin/read/search preferences.',
      'Clear-thread uses the original immediate clear; clear-threads uses the original eligible subset and Undo. All requested targets must be visible before either action runs. Renderer removal does not confirm disk eviction.',
      'Clear-completed uses the original filtered list, including collapsed groups. Disabled is a no-op. Renderer removal does not claim disk eviction; the original Undo toast remains available.',
      'Mark-all-read uses the existing badge-coherent unread set, including threads hidden by search or scope. A disabled control is a no-op. Its renderer acknowledgement does not claim durable persistence.',
      'Read-toggle requires a current visible thread. Read-toggle-many requires distinct visible targets, reads only unread targets in a mixed selection, and otherwise marks only eligible read targets unread. The page protects the open thread; the sidebar keeps its existing exception.',
      'The requested surface must already be visible for applied=true. Compact requires measured thread rows. Preference persistence acknowledges the current host preference, not a disk flush.'
    ]
  }
}

export const ACTIVITY_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'activity', 'get'],
    aliases: [['ui', 'activity', 'show']],
    ...activityOptions('get')
  },
  { path: ['ui', 'activity', 'copy'], ...activityOptions('copy') },
  {
    path: ['ui', 'activity', 'preview-copy-issue-link'],
    ...activityOptions('preview-copy-issue-link')
  },
  { path: ['ui', 'activity', 'preview-copy-path'], ...activityOptions('preview-copy-path') },
  { path: ['ui', 'activity', 'preview'], ...activityOptions('preview') },
  { path: ['ui', 'activity', 'preview-edit'], ...activityOptions('preview-edit') },
  { path: ['ui', 'activity', 'context-menu'], ...activityOptions('context-menu') },
  { path: ['ui', 'activity', 'preview-review-menu'], ...activityOptions('preview-review-menu') },
  { path: ['ui', 'activity', 'preview-issue-menu'], ...activityOptions('preview-issue-menu') },
  { path: ['ui', 'activity', 'close'], ...activityOptions('close') },
  { path: ['ui', 'activity', 'resize'], ...activityOptions('resize') },
  { path: ['ui', 'activity', 'scroll'], ...activityOptions('scroll') },
  { path: ['ui', 'activity', 'jump'], ...activityOptions('jump') },
  { path: ['ui', 'activity', 'select'], ...activityOptions('select') },
  { path: ['ui', 'activity', 'group-toggle'], ...activityOptions('group-toggle') },
  { path: ['ui', 'activity', 'mark-all-read'], ...activityOptions('mark-all-read') },
  { path: ['ui', 'activity', 'clear-completed'], ...activityOptions('clear-completed') },
  { path: ['ui', 'activity', 'clear-thread'], ...activityOptions('clear-thread') },
  { path: ['ui', 'activity', 'clear-threads'], ...activityOptions('clear-threads') },
  { path: ['ui', 'activity', 'read-toggle'], ...activityOptions('read-toggle') },
  { path: ['ui', 'activity', 'read-toggle-many'], ...activityOptions('read-toggle-many') },
  { path: ['ui', 'activity', 'group'], ...activityOptions('group') },
  { path: ['ui', 'activity', 'read'], ...activityOptions('read') },
  { path: ['ui', 'activity', 'compact'], ...activityOptions('compact') },
  { path: ['ui', 'activity', 'children'], ...activityOptions('children') },
  { path: ['ui', 'activity', 'origin'], ...activityOptions('origin') },
  { path: ['ui', 'activity', 'scope-reset'], ...activityOptions('scope-reset') },
  { path: ['ui', 'activity', 'host-toggle'], ...activityOptions('host-toggle') },
  { path: ['ui', 'activity', 'hosts-toggle-all'], ...activityOptions('hosts-toggle-all') },
  { path: ['ui', 'activity', 'search'], ...activityOptions('search') },
  { path: ['ui', 'activity', 'search-clear'], ...activityOptions('search-clear') },
  { path: ['ui', 'activity', 'search-visible'], ...activityOptions('search-visible') }
]
