import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_LINEAGE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['worktree', 'update-desktop-lineage'],
    summary: 'Set or clear a desktop workspace parent using exact instance identities',
    usage:
      'orca worktree update-desktop-lineage --params-file <file|-> --confirm <identityKey|worktreeId:instanceId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {target: {worktreeId, executionHostId, identityKey}, parent: {worktreeId, executionHostId, identityKey}} or {target, noParent: true}. Obtain identity.key from worktree show/list; confirmation must equal target.identityKey.',
      'A workspace in a folder repository may instead supply {worktreeId, executionHostId, instanceId}, using its actual instanceId from worktree show/list. Supply exactly one of identityKey or instanceId per target. Folder confirmation is worktreeId:instanceId. Git workspaces require identityKey; project-group folder workspaces without a repository owner are rejected.',
      'Reuses the desktop lineage writer, parent validation and notifications. The parent must share the repository, execution host and project; cycles are rejected. Folder selection checks the persisted instance without synthesizing a runtime identity key.',
      'Because lineage storage uses unqualified workspace IDs, this command rejects a repository ID registered on multiple hosts, runtime-owned repositories, stale instance identities and a stored edge belonging to a different child instance. It never falls back to another host.',
      'Success follows the profile write barrier. Save failure does not imply an in-memory rollback; inspect lineage before retrying. Node hosts without the desktop service and old peers fail without client-profile writes. Older schemas reject instanceId without a fallback. No renderer acknowledgement or process-exit verdict is implied.'
    ]
  }
]
