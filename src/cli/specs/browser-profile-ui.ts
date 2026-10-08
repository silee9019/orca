import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_PROFILE_UI_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'profile-ui'],
    summary:
      'Use the native host viewer profile menu and dialogs; guest registration is not verified',
    usage:
      'orca browser profile-ui --viewer host --page <id> --action <menu-open|menu-close|select|switch-confirm|switch-cancel|new-open|new-name|new-create|new-cancel|detect-browsers|import-browser|import-file|status> [--family <family>] [--browser-profile <profile>] [--file <path>] [--profile <id>] [--name <name>] [--confirm] [--json]',
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
