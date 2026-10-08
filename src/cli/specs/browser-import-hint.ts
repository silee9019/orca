import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_IMPORT_HINT_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'import-hint'],
    summary: 'Read or control the exact mounted browser import hint',
    usage:
      'orca browser import-hint --viewer host --host <id> --page <id> --profile <id> --action status|open|close|menu-open|menu-close|settings|hide|import-file|import-browser [--browser <family> --source-profile <name>] [--file <path> --confirm-profile <id>] [--confirm hide-browser-import-hint] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'host',
      'page',
      'profile',
      'action',
      'confirm',
      'file',
      'confirm-profile',
      'browser',
      'source-profile'
    ],
    notes: [
      'Targets the active mounted page and its exact profile/import host. Opening reuses the existing best-effort browser detection; detectionSettled does not assert a successful scan. Hide requires --confirm hide-browser-import-hint and awaits the existing UI writer followed by storage readback. Import-file reuses the existing local cookie importer with an explicit file and exact profile confirmation; cookie contents and domains are omitted from output. Inactive, ambiguous, mismatched, busy or expired owners return explicit errors.'
    ]
  }
]
