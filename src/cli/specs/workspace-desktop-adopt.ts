import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_DESKTOP_ADOPT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['worktree', 'adopt-desktop-provisioned-root'],
    summary: 'Adopt the exact primary checkout owned by an existing provisioned-root runtime',
    usage:
      'orca worktree adopt-desktop-provisioned-root --params-file <file|-> --confirm <repoId:expectedRepoHostId:runtimeId:expectedPath> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON requires repoId, name, expectedExecutionHostId: "local", expectedRepoHostId: "ssh:<runtime-owned-target>", runtimeId, expectedPath and setupDecision: "skip". If baseBranch is supplied, expectedRefHead is required. Confirmation equals repoId:expectedRepoHostId:runtimeId:expectedPath. Existing metadata label/link/agent/rename fields are accepted through stdin/file.',
      'Reuses the desktop adoption service: the existing runtime must own the SSH target and provisioned-root recipe; its projectRoot must match both repo path and expectedPath. The provider authority, repository and runtime ownership are checked again after Git reads. Primary non-bare/non-sparse checkout, exact requested branch and optional ref head are verified before runtime attachment and metadata writes.',
      'This command does not provision a VM, establish SSH or run setup/startup commands. Startup, sparse checkout and parent workspace inputs are rejected. Repository IDs registered on multiple hosts are rejected without fallback. Old peers and Node-only hosts fail without client-profile writes.',
      'The server stamps CLI provenance. Success follows runtime attachment and profile persistence; the receipt contains only IDs/path/instance/catalog and does not prove renderer adoption, VM health or agent readiness. Partial failure may leave runtime attachment or metadata; inspect before retrying. Internal recipe/connection details, automation tokens and private errors are omitted.'
    ]
  }
]
