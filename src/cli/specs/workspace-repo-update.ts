import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_REPO_UPDATE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'update-desktop'],
    summary: 'Update desktop repo settings on an explicit host',
    usage: 'orca repo update-desktop --params-file <file|-> --confirm <repoId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {repoId, hostId, updates}. Reuses desktop repo normalization, host-specific Store updates and repo-changed notification. Another host with the same repo ID is preserved. A host registration must already exist.',
      'Preserves empty display names and worktree base paths. Null clears account binding, visibility inheritance, discovery suppression or Source Control AI overrides where supported by the desktop API. Invalid account and hook inputs fail before writing; hook scripts are stored and are not executed by this command.',
      'Updating worktreeBasePath also schedules the original native worktree-root preflight and invalidates authorized roots. SSH/runtime owners do not receive a local filesystem fallback. A successful profile write does not prove the asynchronous root preflight or renderer refresh completed.',
      'Acknowledges identity after the profile write barrier and omits setting text. Save failure does not guarantee in-memory rollback. Node hosts without the desktop service and old peers fail without client-profile writes.'
    ]
  }
]
