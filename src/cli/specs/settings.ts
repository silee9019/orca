import { GLOBAL_FLAGS, type CommandSpec } from '../args'

const SETTINGS_NOTES = [
  'Targets the authenticated runtime selected by --environment or --pairing-code; no workspace or Git checkout is required.',
  'Only the existing runtime-owned client preferences are writable. Desktop-local appearance, trust grants, consent, and internal migration markers are not accepted.',
  'Credentials, agent environment values, command overrides, and launch recipes are excluded from output. Older hosts must be updated; unsafe read fallbacks are not used.'
]

export const SETTINGS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['settings', 'fields'],
    summary: 'List settings accepted by the safe desktop and runtime writers',
    usage: 'orca settings fields [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Local schema metadata only; does not connect to a runtime or reveal stored values. Nested settings are replaced, so retain unrelated nested values when constructing an update.'
    ]
  },
  {
    path: ['settings', 'import', 'ghostty'],
    summary: 'Preview the answering host Ghostty configuration import',
    usage: 'orca settings import ghostty [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Read-only preview using existing host discovery and mapping. Apply the returned diff through settings desktop update --file after reviewing it; this command never opens a native picker.'
    ]
  },
  {
    path: ['settings', 'import', 'warp'],
    summary: 'Preview automatically discovered Warp themes on the answering host',
    usage: 'orca settings import warp [--file <path|->] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'file'],
    notes: [
      'Read-only preview using existing host discovery, parsing limits and theme normalization. Optional --file JSON is {kind:"files",paths:[...]}, {kind:"folder",path:...}, or {kind:"auto"}; paths name files on the answering host. Select themes and write terminalCustomThemes through settings desktop update --file; existing themes must be retained in that list. Native file and folder pickers are not opened.'
    ]
  },
  {
    path: ['settings', 'desktop', 'get'],
    summary: 'Read safe settings owned by the answering desktop runtime',
    usage: 'orca settings desktop get [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads the selected host desktop profile, including appearance, terminal, editor and notifications. Does not read or modify the CLI machine profile.',
      'Credential values and launch commands are omitted. A runtime without desktop settings services returns settings_viewer_unavailable.'
    ]
  },
  {
    path: ['settings', 'desktop', 'update'],
    summary: 'Apply desktop settings through the same writer as the Settings window',
    usage: 'orca settings desktop update --file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'file'],
    notes: [
      'Targets the answering host desktop profile. Uses its Settings writer for normalization, proxy application, menus, app icon, language, awake assertions and change notifications.',
      'JSON comes only from a file or stdin (--file -), never a command-line value. Secret values and launch commands are not returned.',
      'Numeric values and environment variable names are limited to what the Settings controls accept; out-of-range input is rejected rather than clamped.',
      'Authority grants, confirmation bypasses, account records, plugin consent, migration markers and active connection selection require their dedicated controls.',
      'Success is returned after the profile flush. rendered:false explicitly means no viewer application acknowledgement was collected. Settings changes are broadcast to that host desktop viewers.',
      'A runtime without desktop settings services returns settings_viewer_unavailable. Process-wide options may still require a separately approved restart.'
    ]
  },
  {
    path: ['settings', 'fonts'],
    summary: 'List fonts available to the answering desktop runtime',
    usage: 'orca settings fonts [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: ['A runtime without desktop settings services returns settings_viewer_unavailable.']
  },
  {
    path: ['settings', 'keybindings', 'get'],
    summary: 'Read the answering desktop runtime shortcut file and diagnostics',
    usage: 'orca settings keybindings get [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the same shortcut service as Settings; does not read the CLI machine home directory.'
    ]
  },
  {
    path: ['settings', 'keybindings', 'reload'],
    summary: 'Reload the answering desktop runtime shortcut file',
    usage: 'orca settings keybindings reload [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Refreshes the desktop shortcut service, menus and plugin activation through the existing change callback.'
    ]
  },
  {
    path: ['settings', 'keybindings', 'set'],
    summary: 'Set, disable or reset one shortcut on the answering desktop runtime',
    usage: 'orca settings keybindings set --file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'file'],
    notes: [
      'JSON is {actionId, bindings}. Use a string array to set bindings, [] to disable, or null to reset the current-platform override.',
      'Uses the existing conflict validator and preserves other platforms and common overrides. A headless runtime without this desktop service returns settings_viewer_unavailable.'
    ]
  },
  {
    path: ['settings', 'preflight', 'check'],
    summary: 'Check installed tools and provider authentication on the selected runtime',
    usage: 'orca settings preflight check [--force] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'force', 'wsl', 'wsl-default'],
    notes: [
      'Read-only provider checks; output excludes account identifiers and credential-bearing URLs. --wsl <distro> or --wsl-default targets Windows guest tools; other hosts reject WSL explicitly.'
    ]
  },
  {
    path: ['settings', 'agents', 'detect'],
    summary: 'Detect installed coding agents on the selected runtime or one SSH host',
    usage: 'orca settings agents detect [--host local|ssh:<id|label>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'host', 'wsl', 'wsl-default'],
    notes: [
      'SSH selectors resolve against the answering runtime; paired runtime selection remains --environment. No Git workspace is required.'
    ]
  },
  {
    path: ['settings', 'agents', 'refresh'],
    summary: 'Refresh the selected runtime shell PATH and detect coding agents',
    usage: 'orca settings agents refresh [--wsl <distro>|--wsl-default] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'wsl', 'wsl-default'],
    notes: ['Targets the answering runtime host; omits PATH segments from output.']
  },
  {
    path: ['settings', 'agents', 'zcode-capability'],
    summary: 'Check whether the selected runtime ZCode can open an interactive session',
    usage: 'orca settings agents zcode-capability [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the existing cached noninteractive probe; unknown means the probe could not establish capability.'
    ]
  },
  {
    path: ['settings', 'get'],
    summary: 'Read safe preferences from the selected Orca runtime',
    usage: 'orca settings get [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: SETTINGS_NOTES
  },
  {
    path: ['settings', 'update'],
    summary: 'Update runtime preferences from a JSON file or stdin',
    usage: 'orca settings update --file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'file'],
    notes: [
      ...SETTINGS_NOTES,
      'Use --file - for stdin. JSON is limited to 1 MiB, is validated before sending, and is never repeated in errors.',
      'Returns the runtime preference read-back after the existing settings controller applies the update; this is not a rendered-viewer acknowledgement.'
    ],
    examples: ['orca settings update --file ./settings.json --json']
  },
  {
    path: ['settings', 'review-bot'],
    summary: 'Mark or unmark a review comment author as a bot',
    usage: 'orca settings review-bot --author <login> --is-bot <true|false> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'author', 'is-bot'],
    notes: SETTINGS_NOTES
  }
]
