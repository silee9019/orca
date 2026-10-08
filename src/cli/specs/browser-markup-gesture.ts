import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_MARKUP_GESTURE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'markup', 'gesture'],
    summary:
      'Apply one bounded normalized gesture using the existing markup tool and canvas; rendering is unverified',
    usage:
      'orca browser markup gesture --viewer host --page <id> --points-file <JSON-array-file> [--cancel] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'points-file', 'cancel']
  }
]
