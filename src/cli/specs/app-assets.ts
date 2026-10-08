import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const APP_ASSET_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['app', 'feedback', 'submit'],
    summary: 'Send reviewed feedback and optional host image files',
    usage: 'orca app feedback submit --input-file <path> --confirm-target <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'confirm-target'],
    notes: [
      'File JSON requires feedback and submitAnonymously. Image paths belong to the addressed desktop host. Sends through the existing feedback service; output never echoes the report or identity.'
    ]
  },
  {
    path: ['app', 'pet', 'preferences'],
    summary: 'List bundled/custom pets and saved preferences',
    usage: 'orca app pet preferences [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['app', 'pet', 'set'],
    summary: 'Save selected pet, visibility or clamped size',
    usage: 'orca app pet set --input-file <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file'],
    notes: ['Writes saved desktop preferences; rendered:false requires separate viewer readback.']
  },
  {
    path: ['app', 'pet', 'remove'],
    summary: 'Remove a registered custom pet and select the fallback if needed',
    usage: 'orca app pet remove --id <id> --confirm-id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'confirm-id'],
    destructive: true
  },
  {
    path: ['app', 'feature-assets'],
    summary: 'Read the feature-wall asset base URL',
    usage: 'orca app feature-assets [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'markdown-directory'],
    summary: 'Read the app-owned markdown notes directory',
    usage: 'orca app markdown-directory [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'keyboard-source'],
    summary: 'Read the active macOS input source',
    usage: 'orca app keyboard-source [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'keyboard-layout'],
    summary: 'Read the native keyboard layout',
    usage: 'orca app keyboard-layout [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'dock-badge'],
    summary: 'Set the Dock unread count',
    usage: 'orca app dock-badge [--count <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'count'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'pet', 'import'],
    summary: 'Import an image or pet bundle from an absolute host path',
    usage: 'orca app pet import [--path <value>] [--kind <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path', 'kind'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'pet', 'read'],
    summary: 'Read pet bytes as base64',
    usage: 'orca app pet read [--id <value>] [--file-name <value>] [--kind <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'file-name', 'kind'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'pet', 'delete'],
    summary: 'Request deletion of the exact confirmed pet',
    usage:
      'orca app pet delete [--id <value>] [--file-name <value>] [--kind <value>] [--confirm-id <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'file-name', 'kind', 'confirm-id'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'shell', 'open-url'],
    summary: 'Open an HTTP(S) URL supplied through a JSON file',
    usage: 'orca app shell open-url [--input-file <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'shell', 'open-path'],
    summary: 'Reveal an existing absolute host path in its file manager',
    usage: 'orca app shell open-path [--path <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'shell', 'exists'],
    summary: 'Check an absolute path on the desktop runtime host',
    usage: 'orca app shell exists [--path <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'shell', 'select'],
    summary: 'Replace a native file picker with an explicitly supplied host path',
    usage: 'orca app shell select [--path <value>] [--kind <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path', 'kind'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'star-prompt'],
    summary: 'Read or change the existing star prompt',
    usage:
      'orca app star-prompt [--action <value>] [--viewer <value>] [--confirm-target <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'action', 'viewer', 'confirm-target'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'vault', 'status'],
    summary: 'Read index status from the answering runtime',
    usage: 'orca app vault status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  },
  {
    path: ['app', 'vault', 'first-prompt'],
    summary: 'Read a private first user prompt using file-based selectors',
    usage: 'orca app vault first-prompt --input-file <path> --output-file <new-path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'output-file'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt content is written only to a new private output file, never stdout.'
    ]
  },
  {
    path: ['app', 'vault', 'clear-index'],
    summary: 'Clear the confirmed desktop runtime search index',
    usage: 'orca app vault clear-index [--confirm-target <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm-target'],
    notes: [
      'Targets the connected runtime; paths are absolute on that host. Native desktop actions fail on a headless server. Pet import stores metadata and selection; preferences report persisted state separately from rendering. Star action requires the current app target and uses that host account. First-prompt output is private transcript content.'
    ]
  }
]
