import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_SETTINGS_VIEWER_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'settings', 'viewer'],
    summary: 'Apply a browser settings action through the mounted host settings owner',
    usage:
      'orca browser settings viewer --viewer host --host <current-settings-host> --action <action> [--value <value>] [--host <host-id>] [--profile <profile-id|default>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'action', 'value', 'host', 'profile'],
    notes: [
      'Actions: status, homepage-draft, homepage-save, search-engine, zoom, profile-dialog-open, profile-dialog-close, profile-dialog-status, profile-name, profile-create, profile-select, host-select, cookies-scroll, computer-use-open.',
      'Requires the browser settings pane to be mounted in the host viewer. Draft changes and durable saving are distinct. The result does not claim durable persistence or native rendering.',
      'search-engine and zoom take --value; profile-select takes --profile default or an existing isolated profile ID; host-select takes --value <new-host-id>; every action requires --host matching the current settings host. A missing owner or expired request fails explicitly.'
    ]
  }
]
