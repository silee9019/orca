import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_ANNOTATION_TRAY_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'annotation', 'tray'],
    summary: 'Use the native host viewer annotation tray and verified clipboard copy',
    usage:
      'orca browser annotation tray --viewer host --page <id> --action <open|close|copy|clear|send-menu-open|send-menu-close|status> [--confirm] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'action', 'confirm']
  }
]
