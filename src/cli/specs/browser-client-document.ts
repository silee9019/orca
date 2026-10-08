import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_DOCUMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-document'],
    summary:
      'Convert an exact client-hosted page to a workspace document or activate its existing document',
    usage:
      'orca browser client-document --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --browser-client <client> --browser-host-generation <generation> --page-host-generation <generation> --value <document-path> [--document-worktree <owning-workspace>] [--json]',
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
      'value',
      'document-worktree'
    ],
    notes: [
      '--runtime-environment identifies the materialized page; global --environment independently selects the viewer runtime. Reuses the original address document route and conversion Store. Defaults to the source worktree; --document-worktree explicitly authorizes the resolver-selected owning workspace. Other-worktree input without that exact selector, staged/deferred pages and non-document input are refused before conversion. Receipt observes the document Store and intended page replacement/activation, not filesystem reads, preview grant readiness, native rendering or OS focus.'
    ]
  }
]
