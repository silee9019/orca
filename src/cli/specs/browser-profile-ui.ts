import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_PROFILE_UI_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'profile-ui'],
    summary:
      'Use the host profile menu; cookie imports require --profile and --confirm; guest registration is not verified',
    usage:
      'orca browser profile-ui --viewer host --page <id> --action <settings-open|menu-open|menu-close|select|switch-confirm|switch-cancel|new-open|new-name|new-create|new-cancel|detect-browsers|import-browser|import-file|status> [--family <family>] [--browser-profile <profile>] [--file <path>] [--profile <id>] [--name <name>] [--confirm] [--json]',
    notes: [
      'settings-open requires an open menu. Its settings receipt confirms the settings target, page and cleared search in the viewer store.',
      'For settings-open, the other profile fields (including menuOpen) are the snapshot before selection; they do not confirm menu closure or native focus.'
    ],
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'page',
      'action',
      'profile',
      'name',
      'family',
      'browser-profile',
      'file',
      'confirm'
    ]
  }
]
