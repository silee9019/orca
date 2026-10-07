import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_SETTINGS_VIEWER_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'settings', 'viewer'],
    summary: 'Apply a browser settings action through the mounted host settings owner',
    usage:
      'orca browser settings viewer --viewer host --host <current-settings-host> --action <action> [--value <value>] [--host <host-id>] [--profile <profile-id|default>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'action',
      'value',
      'host',
      'profile',
      'surface',
      'browser-family',
      'browser-profile',
      'file',
      'confirm'
    ],
    notes: [
      'Actions: kagi-clear, browser-use-copy-example, browser-use-status, browser-use-enabled, browser-use-refresh, browser-use-install-intent, browser-use-configure, browser-use-computer, cookies-configure, profile-status, detect-browsers, cookies-import-browser, cookies-import-file, profile-delete, default-cookies-clear, status, homepage-draft, homepage-save, search-engine, zoom, profile-dialog-open, profile-dialog-close, profile-dialog-status, profile-name, profile-create, profile-select, host-select, cookies-scroll, computer-use-open.',
      'Cookie import requires --profile <id> --surface profile-row|browser-use --confirm <same-profile-id>. File import uses --file <path> on the selected local host, with no native picker. Browser import requires --browser-family and optional --browser-profile from detected metadata. Cookie contents are never command arguments or result fields. Delete/clear requires --profile and --confirm <same-id>.',
      'kagi-clear clears the existing masked Kagi link through its visible settings owner, resets the draft and shows the existing toast. It accepts no secret input and returns only configured/draft-present booleans.',
      'browser-use-copy-example takes --value 0|1|2 and copies an existing example through its mounted owner; clipboard read-back is compared without returning its contents.',
      'browser-use-install-intent records the existing setup feature interaction only; it does not open a terminal or install a skill.',
      'Requires the browser settings pane to be mounted in the host viewer. Draft changes and durable saving are distinct. The result does not claim durable persistence or native rendering.',
      'browser-use-enabled takes --value true|false; search-engine and zoom take --value; profile-select takes --profile default or an existing isolated profile ID; host-select takes --value <new-host-id>; every action requires --host matching the current settings host. A missing owner or expired request fails explicitly.'
    ]
  }
]
