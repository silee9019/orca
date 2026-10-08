import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_MARKUP_HINT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'markup-hint'],
    summary: 'Dismiss the visible draw hint or toggle its original toolbar control',
    usage:
      'orca browser markup-hint --viewer host --page <id> --action <toggle|dismiss|status> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'action']
  }
]
