import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_DESKTOP_CREATE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['worktree', 'create-desktop'],
    summary: 'Create a workspace through the desktop creation service with explicit host ownership',
    usage:
      'orca worktree create-desktop --params-file <file|-> --confirm <repoId:expectedRepoHostId:name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON requires repoId, name, expectedExecutionHostId: "local", expectedRepoHostId and setupDecision: "run"|"skip"|"inherit". Confirmation equals repoId:expectedRepoHostId:name. This requires the desktop service; old peers and Node hosts fail without client-profile writes.',
      'Reuses the desktop Git/folder creator, branch/base/sparse settings, linked items, labels, parent workspace, selected agent, first-message rename reservation, notifications and lifecycle callback. Repository IDs registered on multiple hosts and runtime-owned repositories are rejected. SSH uses its original host route without local fallback.',
      'Optional startup accepts command, env, launchConfig, viewMode and startupCommandDelivery through stdin/file only. launchToken, launchAgent, telemetry, system provenance and caller creationId are rejected. The server stamps CLI provenance and issues a fresh creationId. Folder startup, rename reservation, parent, sparse and push settings are rejected. pushTarget.remoteUrl is not supported by this command.',
      'The receipt contains workspace identity/path, catalog version, actual startup spawn acknowledgement and a warning flag. Setup/default-tab launch envelopes and private warnings are omitted; the receipt does not acknowledge renderer setup, tab adoption, progress subscription or agent readiness. A startup request can be deferred by existing default-tab policy.',
      'Success follows the profile write barrier. A failure after creation does not guarantee rollback; inspect worktree list before retrying. setupDecision run/inherit may prepare original setup hooks; no extra window activation is requested.'
    ]
  }
]
