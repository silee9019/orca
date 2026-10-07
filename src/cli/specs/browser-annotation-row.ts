import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_ANNOTATION_ROW_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'annotation', 'row'],
    summary: 'Edit an annotation through the already open native viewer tray row owner',
    usage:
      'orca browser annotation row --viewer host --page <id> --action <start|comment|intent|save|cancel|status> [--annotation <id>] [--text <comment>] [--intent <change|question>] [--confirm] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'page',
      'action',
      'annotation',
      'text',
      'intent',
      'confirm'
    ]
  }
]
