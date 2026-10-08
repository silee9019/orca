import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_HISTORY_DOCUMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-history-document'],
    summary: 'Select an exact current document history suggestion of a client page',
    usage:
      'orca browser client-history-document --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --browser-client <client> --browser-host-generation <generation> --page-host-generation <generation> --index <index> --document-worktree <document-workspace> --value <exact-file-path> [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'page',
      'runtime-environment',
      'remote-page',
      'browser-client',
      'browser-host-generation',
      'page-host-generation',
      'index',
      'document-worktree',
      'value'
    ],
    notes: [
      'Open the address suggestions first. The index, owning workspace and path must match one current document row. Reuses its original selection callback and confirms the destination document Store state. No arbitrary document location or native rendering acknowledgment.'
    ]
  },
  {
    path: ['browser', 'client-staged-history-document'],
    summary: 'Select an exact current document history suggestion before client guest attachment',
    usage:
      'orca browser client-staged-history-document --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --index <index> --document-worktree <document-workspace> --value <exact-file-path> [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'page',
      'runtime-environment',
      'remote-page',
      'index',
      'document-worktree',
      'value'
    ],
    notes: [
      'Requires an active staged client source with no materialized placement and an open, exact document suggestion. An old peer without this operation is unavailable.'
    ]
  }
]
