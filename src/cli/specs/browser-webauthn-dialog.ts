import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_WEBAUTHN_DIALOG_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'webauthn', 'dialog-respond'],
    summary: 'Respond through the exact mounted passkey account dialog',
    usage:
      'orca browser webauthn dialog-respond --viewer host --page <page> --worktree <workspace> --request <id> --relying-party <site> [--runtime-environment <id>] <--cancel|--credential-file <path>> --confirm [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'page',
      'worktree',
      'request',
      'relying-party',
      'runtime-environment',
      'cancel',
      'credential-file',
      'confirm'
    ],
    notes: [
      'Requires the current dialog queue head and an acknowledged response. Credential IDs are read from a file and omitted from receipts. Old peers fail explicitly.'
    ]
  }
]
