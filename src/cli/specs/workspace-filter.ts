import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const WORKSPACE_FILTER_COMMAND_SPECS: CommandSpec[] = [
  ...['select', 'remove-last'].map((action) => ({
    path: ['ui', 'project-filter', action],
    summary:
      action === 'select'
        ? 'Select the highlighted project without synthesizing a key event'
        : 'Remove the last selected project while the project search is empty',
    usage: `orca ui project-filter ${action} --viewer host --surface <project-panel>${action === 'select' ? ' --repo <id>' : ''} [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'surface', ...(action === 'select' ? ['repo'] : [])],
    notes: [
      'Uses the same project selection and removal effects as Enter and empty-input Backspace. Requires an open mounted surface, preserves other filters and waits for durable and rendered acknowledgements. Select requires the highlighted result ID and clears the search after applying.'
    ]
  })),
  ...['menu', 'search', 'highlight', 'focus'].map((action) => ({
    path: ['ui', action === 'menu' ? 'workspace-filter' : 'project-filter', action],
    summary: `${action} in an explicitly selected host filter surface`,
    usage: `orca ui ${action === 'menu' ? 'workspace-filter' : 'project-filter'} ${action} --viewer host --surface <sidebar|workspace-board${action === 'menu' ? '' : '|project-panel'}>${action === 'menu' ? ' --state <open|closed>' : action === 'search' ? ' --query <text>' : action === 'highlight' ? ' --repo <id>' : ''} [--json]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'surface',
      ...(action === 'menu'
        ? ['state']
        : action === 'search'
          ? ['query']
          : action === 'highlight'
            ? ['repo']
            : [])
    ],
    notes: [
      'Uses the mounted filter component and reports its resulting layout. Search and highlighting preserve saved filters. Absent, closed or ambiguous surfaces are rejected. Focus stays inside the hidden renderer; it does not activate a native window.'
    ]
  })),
  ...['get', 'set', 'reset'].map((operation) => ({
    path: ['ui', 'workspace-filter', operation],
    summary: `${operation === 'get' ? 'Read' : operation === 'set' ? 'Set' : 'Reset'} the host viewer workspace filters`,
    usage: `orca ui workspace-filter ${operation} --viewer host${operation === 'set' ? ' --filters <json>' : ''} [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', ...(operation === 'set' ? ['filters'] : [])],
    notes: [
      'Targets the selected runtime host viewer; headless runtimes and viewers displaying another runtime are rejected.',
      'Reports persisted and applied separately; persisted=null means that a runtime switch prevented storage read-back. A saved filter is not evidence that the sidebar rendered it.',
      'Set accepts showSleepingWorkspaces, alwaysShowDefaultBranchWorkspace, hideDefaultBranchWorkspace, hideAutomationGeneratedWorkspaces, hideCliCreatedWorkspaces, hideDetachedHeadWorkspaces and filterRepoIds. Reset restores the same defaults as the sidebar Reset filters button.',
      'A timeout leaves persistence unknown; read the filters before deciding whether to retry.'
    ]
  })),
  ...['remove', 'toggle'].map((operation) => ({
    path: ['ui', 'project-filter', operation],
    summary: `${operation === 'remove' ? 'Remove' : 'Toggle'} one project in the host viewer filter`,
    usage: `orca ui project-filter ${operation} --viewer host --repo <id> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'repo'],
    notes: [
      'Preserves the other selected projects and workspace filters. Reports storage and rendered sidebar acknowledgements separately. Removing an obsolete project ID is allowed; toggling an unknown project is rejected.'
    ]
  }))
]
