import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_REPO_CREATE_REMOTE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'create-desktop-remote'],
    summary: 'Create and register a Git repo or folder on a selected SSH host',
    usage:
      'orca repo create-desktop-remote --params-file <file|-> --confirm <connectionId:parentPath:name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {connectionId,parentPath,name,kind:"git"|"folder",expectedExecutionHostId:"local"}. Confirms the connection ID, trimmed supplied parentPath and trimmed name joined by colons. The selected desktop controller resolves the remote home and uses the SSH host path flavor. No local/client fallback; unavailable desktop services, disconnected hosts and old peers fail explicitly.',
      'Reuses the original remote creation service: no-clobber directory creation, nonempty-directory protection and host-qualified registration dedup. Git mode runs init and an initial empty commit using the remote host identity/configuration. Folder mode does not run Git. Original failure cleanup can remove a newly created target, or .git after commit failure in a preexisting empty target; cleanup errors may leave files behind.',
      'Success means the original service returned a registration, not that a terminal or agent is ready. A transport timeout does not cancel or roll back creation; inspect the selected host and catalog before retrying. Provider/credential diagnostics are replaced by a fixed failure message. Requires an already connected SSH target; does not configure Git identity or complete OS approval.'
    ]
  }
]
