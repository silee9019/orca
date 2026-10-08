import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_STAGED_DOCUMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-staged-document'],
    summary:
      'Convert an exact staged client-hosted page to a workspace document or activate its existing document',
    usage:
      'orca browser client-staged-document --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --value <document-path> [--document-worktree <owning-workspace>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'page',
      'runtime-environment',
      'remote-page',
      'value',
      'document-worktree'
    ],
    notes: [
      '--runtime-environment identifies the staged page; global --environment independently selects the viewer runtime. Reuses the original document route before guest-null deferred navigation. Requires exactly one live staged client owner without placement. Defaults to the source worktree; --document-worktree explicitly authorizes the resolver-selected owning workspace. Materialized/restored and non-document input are refused. Receipt observes conversion/activation in the authoritative document Store, not host adoption, placement, filesystem reads, preview grant readiness, native rendering or OS focus.'
    ]
  }
]
