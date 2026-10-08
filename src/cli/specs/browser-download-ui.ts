import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_DOWNLOAD_UI_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'download-ui'],
    summary: 'Open, reveal or dismiss an existing host viewer download with owner acknowledgement',
    usage:
      'orca browser download-ui --viewer host --page <id> --download <id> --action <open|show|dismiss|status> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'download', 'action']
  }
]
