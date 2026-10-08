import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const WORKSPACE_FILTER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'project-filter', 'select'],
    summary: 'Select the highlighted project without synthesizing a key event',
    usage:
      'orca ui project-filter select --viewer host --surface <project-panel> --repo <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'surface', 'repo'],
    notes: [
      'Uses the same project selection and removal effects as Enter and empty-input Backspace. Requires an open mounted surface, preserves other filters and waits for durable and rendered acknowledgements. Select requires the highlighted result ID and clears the search after applying.'
    ]
  },
  {
    path: ['ui', 'project-filter', 'remove-last'],
    summary: 'Remove the last selected project while the project search is empty',
    usage: 'orca ui project-filter remove-last --viewer host --surface <project-panel> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'surface'],
    notes: [
      'Uses the same project selection and removal effects as Enter and empty-input Backspace. Requires an open mounted surface, preserves other filters and waits for durable and rendered acknowledgements. Select requires the highlighted result ID and clears the search after applying.'
    ]
  },
  {
    path: ['ui', 'workspace-filter', 'menu'],
    summary: 'menu in an explicitly selected host filter surface',
    usage:
      'orca ui workspace-filter menu --viewer host --surface <sidebar|workspace-board> --state <open|closed> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'surface', 'state'],
    notes: [
      'Uses the mounted filter component and reports its resulting layout. Search and highlighting preserve saved filters. Absent, closed or ambiguous surfaces are rejected. Focus stays inside the hidden renderer; it does not activate a native window.'
    ]
  },
  {
    path: ['ui', 'project-filter', 'search'],
    summary: 'search in an explicitly selected host filter surface',
    usage:
      'orca ui project-filter search --viewer host --surface <sidebar|workspace-board|project-panel> --query <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'surface', 'query'],
    notes: [
      'Uses the mounted filter component and reports its resulting layout. Search and highlighting preserve saved filters. Absent, closed or ambiguous surfaces are rejected. Focus stays inside the hidden renderer; it does not activate a native window.'
    ]
  },
  {
    path: ['ui', 'project-filter', 'highlight'],
    summary: 'highlight in an explicitly selected host filter surface',
    usage:
      'orca ui project-filter highlight --viewer host --surface <sidebar|workspace-board|project-panel> --repo <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'surface', 'repo'],
    notes: [
      'Uses the mounted filter component and reports its resulting layout. Search and highlighting preserve saved filters. Absent, closed or ambiguous surfaces are rejected. Focus stays inside the hidden renderer; it does not activate a native window.'
    ]
  },
  {
    path: ['ui', 'project-filter', 'focus'],
    summary: 'focus in an explicitly selected host filter surface',
    usage:
      'orca ui project-filter focus --viewer host --surface <sidebar|workspace-board|project-panel> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'surface'],
    notes: [
      'Uses the mounted filter component and reports its resulting layout. Search and highlighting preserve saved filters. Absent, closed or ambiguous surfaces are rejected. Focus stays inside the hidden renderer; it does not activate a native window.'
    ]
  },
  {
    path: ['ui', 'workspace-filter', 'get'],
    aliases: [['ui', 'workspace-filter', 'show']],
    summary: 'Read the host viewer workspace filters',
    usage: 'orca ui workspace-filter get --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes: [
      'Targets the selected runtime host viewer; headless runtimes and viewers displaying another runtime are rejected.',
      'Reports persisted and applied separately; persisted=null means that a runtime switch prevented storage read-back. A saved filter is not evidence that the sidebar rendered it.',
      'Set accepts showSleepingWorkspaces, alwaysShowDefaultBranchWorkspace, hideDefaultBranchWorkspace, hideAutomationGeneratedWorkspaces, hideCliCreatedWorkspaces, hideDetachedHeadWorkspaces and filterRepoIds. Reset restores the same defaults as the sidebar Reset filters button.',
      'A timeout leaves persistence unknown; read the filters before deciding whether to retry.'
    ]
  },
  {
    path: ['ui', 'workspace-filter', 'set'],
    summary: 'Set the host viewer workspace filters',
    usage: 'orca ui workspace-filter set --viewer host --filters <json> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'filters'],
    notes: [
      'Targets the selected runtime host viewer; headless runtimes and viewers displaying another runtime are rejected.',
      'Reports persisted and applied separately; persisted=null means that a runtime switch prevented storage read-back. A saved filter is not evidence that the sidebar rendered it.',
      'Set accepts showSleepingWorkspaces, alwaysShowDefaultBranchWorkspace, hideDefaultBranchWorkspace, hideAutomationGeneratedWorkspaces, hideCliCreatedWorkspaces, hideDetachedHeadWorkspaces and filterRepoIds. Reset restores the same defaults as the sidebar Reset filters button.',
      'A timeout leaves persistence unknown; read the filters before deciding whether to retry.'
    ]
  },
  {
    path: ['ui', 'workspace-filter', 'reset'],
    summary: 'Reset the host viewer workspace filters',
    usage: 'orca ui workspace-filter reset --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes: [
      'Targets the selected runtime host viewer; headless runtimes and viewers displaying another runtime are rejected.',
      'Reports persisted and applied separately; persisted=null means that a runtime switch prevented storage read-back. A saved filter is not evidence that the sidebar rendered it.',
      'Set accepts showSleepingWorkspaces, alwaysShowDefaultBranchWorkspace, hideDefaultBranchWorkspace, hideAutomationGeneratedWorkspaces, hideCliCreatedWorkspaces, hideDetachedHeadWorkspaces and filterRepoIds. Reset restores the same defaults as the sidebar Reset filters button.',
      'A timeout leaves persistence unknown; read the filters before deciding whether to retry.'
    ]
  },
  {
    path: ['ui', 'project-filter', 'remove'],
    aliases: [['ui', 'project-filter', 'rm']],
    summary: 'Remove one project in the host viewer filter',
    usage: 'orca ui project-filter remove --viewer host --repo <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'repo'],
    notes: [
      'Preserves the other selected projects and workspace filters. Reports storage and rendered sidebar acknowledgements separately. Removing an obsolete project ID is allowed; toggling an unknown project is rejected.'
    ]
  },
  {
    path: ['ui', 'project-filter', 'toggle'],
    summary: 'Toggle one project in the host viewer filter',
    usage: 'orca ui project-filter toggle --viewer host --repo <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'repo'],
    notes: [
      'Preserves the other selected projects and workspace filters. Reports storage and rendered sidebar acknowledgements separately. Removing an obsolete project ID is allowed; toggling an unknown project is rejected.'
    ]
  }
]
