import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const SETTINGS_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'settings', 'open'],
    summary: 'Open an available settings pane in the host viewer',
    usage:
      'orca ui settings open --viewer host --pane <pane> [--repo <id>] [--project-host <host-id>] [--section <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'pane', 'repo', 'project-host', 'section'],
    notes: [
      'Uses the viewer’s current platform, feature and project-host navigation. Repository panes require --repo; --project-host selects that project’s settings host, while the global --host selects the execution runtime. Missing panes and unsaved settings are rejected before navigation. Reports the actual active pane and rendered target; an accepted deep link is not completion.'
    ]
  },
  {
    path: ['ui', 'settings', 'search'],
    summary: 'Search the host viewer settings and read rendered results',
    usage: 'orca ui settings search --viewer host --query <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'query'],
    notes: [
      'Opens Settings and waits for both the input and debounced search results. Empty text clears the search. Preserves the existing ranking, visibility and unsaved-edit policy. No native window activation occurs.'
    ]
  }
]
