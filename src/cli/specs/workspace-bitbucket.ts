import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_BITBUCKET_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['bitbucket', 'connect'],
    summary: 'Verify and save Bitbucket credentials on the selected Orca host',
    usage: 'orca bitbucket connect --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a local file or stdin (-). For token auth, provide authMode: "token" and accessToken. For basic auth, provide authMode: "basic", email and apiToken. baseUrl is optional.',
      'The selected runtime owns verification, protected credential storage and preflight cache invalidation. No credential values or provider error payloads are printed. Use status to confirm the configured source.',
      'Unavailable old-host methods fail explicitly without a local fallback or retry. SSH workspace paths do not move the runtime credential store to the SSH host.'
    ]
  },
  {
    path: ['bitbucket', 'disconnect'],
    summary: 'Remove the selected runtime’s stored Bitbucket credential',
    usage: 'orca bitbucket disconnect --confirm stored-bitbucket-credential [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm'],
    destructive: true,
    notes: [
      'Requires --confirm stored-bitbucket-credential. Environment credentials remain configured; status reports their source. The selected Orca runtime owns this operation.'
    ]
  },
  {
    path: ['bitbucket', 'status'],
    summary: 'Read Bitbucket connection and credential protection metadata',
    usage: 'orca bitbucket status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'The selected runtime reads metadata without decrypting credentials or opening a keychain prompt. API URL output contains only the origin, with credentials, query, fragment and paths withheld.'
    ]
  }
]
