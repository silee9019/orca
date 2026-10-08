import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_DESKTOP_REMOVE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['worktree', 'preview-desktop-removal'],
    summary: 'Preview the exact desktop Git checkout deletion plan',
    usage: 'orca worktree preview-desktop-removal --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {target:{worktreeId,executionHostId,identityKey}}. Uses the desktop Git listing and nested removal planner. The last checkout is the root expectedCheckout; nested deletion requires approval of every returned {path,head,branch}. Preview does not approve deletion. Folder workspaces do not have a Git deletion plan.'
    ]
  },
  {
    path: ['worktree', 'remove-desktop'],
    summary: 'Remove a desktop workspace through the original deletion gates and completion join',
    usage:
      'orca worktree remove-desktop --params-file <file|-> --confirm <identityKey|worktreeId:instanceId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON requires target:{worktreeId,executionHostId,identityKey}. Folder repositories may use instanceId instead of identityKey. Git deletion also requires expectedCheckout:{path,head,branch} from preview-desktop-removal. Confirmation equals identityKey, or worktreeId:instanceId for folders.',
      'Nested removal additionally requires force:true and approvedNestedWorktrees equal to the full fresh preview. Original checkout revalidation, dirty/lock/root checks, archive hooks, PTY/watcher gates, request coalescing and completion join remain authoritative. force does not imply allowUnverifiedPtyStop, skipArchive or allowFailedArchiveHook; each waiver is explicit. Skipping and waiving an archive hook cannot be combined.',
      'Success follows completion and profile persistence, not background acceptance. Folder deletion removes metadata and preserves its files; the original folder service performs best-effort terminal teardown. executionVerdict stays unverifiable because this receipt does not prove process exit. Inspect retained branches and the archive failure waiver flag separately.',
      'Repository IDs registered on multiple hosts, runtime owners and stale identities are rejected without another-host fallback. Disconnected SSH and old or Node-only hosts fail. Save failure or failure partway through nested deletion does not guarantee rollback; inspect before retrying. Internal snapshot prune batch IDs and raw private errors are not accepted or returned.'
    ]
  }
]
