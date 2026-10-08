import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_VIEWPORT_PAN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'viewport-pan'],
    summary: 'Pan the host panel around an oversized browser viewport preset',
    usage:
      'orca browser viewport-pan --viewer host --page <id> --delta-x <pixels> --delta-y <pixels> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'delta-x', 'delta-y']
  }
]
