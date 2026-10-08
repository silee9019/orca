import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_INPUT_FEEDBACK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-input-feedback'],
    summary: 'Apply existing rejected-input feedback on the exact client-hosted page',
    usage:
      'orca browser client-input-feedback --viewer host [--source-kind materialized|staged] --value <rejected-input> --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --browser-client <client> --browser-host-generation <generation> --page-host-generation <generation> [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'source-kind',
      'value',
      'worktree',
      'page',
      'runtime-environment',
      'remote-page',
      'browser-client',
      'browser-host-generation',
      'page-host-generation'
    ],
    notes: [
      'Materialized sources require client/host/page generations; staged sources require the existing exact unplaced staged handle and omit those generation flags. Only invalid or refused local-file input reaches the original UI error callback. Valid navigation/document input is refused; no file is read and the receipt omits raw input/path. --runtime-environment identifies the page; global --environment independently selects the viewer runtime.'
    ]
  }
]
