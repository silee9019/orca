import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const BROWSER_DOCUMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'document'],
    summary:
      'Use the mounted document preview owner; reload reports a request, not completed navigation',
    usage:
      'orca browser document --viewer host --page <id> --action <status|reload|hard-reload|copy-path|copy-relative-path|open-source|open-external|directory-dismiss|directory-allow> [--paths <newline-separated-paths> --confirm-page <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'action', 'paths', 'confirm-page']
  }
]
