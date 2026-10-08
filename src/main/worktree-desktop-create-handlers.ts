import { randomUUID } from 'node:crypto'
import { getRepoForExecutionHost } from './repo-execution-host-selection'
import { buildCliWorkspaceProvenance } from '../shared/cli-workspace-provenance'
import { isFolderRepo } from '../shared/repo-kind'
import { createDesktopWorktree } from './worktree-desktop-create-service'
import type { DesktopWorktreeCreateContext } from './worktree-desktop-create-service'
import type { CreateWorktreeResult } from '../shared/worktree/create-types'
import { setDesktopWorktreeCreateForRpc } from './runtime/rpc/methods/workspace-desktop-create'
export type DesktopWorktreeCreateReceipt = {
  created: true
  creationId: string
  executionHostId: 'local'
  repoHostId: string
  worktree: { id: string; repoId: string; path: string; branch: string; instanceId?: string }
  catalogVersion?: CreateWorktreeResult['catalogVersion']
  startupTerminal?: { spawned: boolean; surface?: 'visible' | 'background' }
  warning: boolean
}
export function registerDesktopWorktreeCreateForRpc(context: DesktopWorktreeCreateContext): void {
  const { store } = context
  setDesktopWorktreeCreateForRpc(async (params) => {
    try {
      const { expectedExecutionHostId, expectedRepoHostId, ...args } = params
      const repo = getRepoForExecutionHost(store, args.repoId, expectedRepoHostId)
      if (
        expectedExecutionHostId !== 'local' ||
        expectedRepoHostId.startsWith('runtime:') ||
        store.getRepos().filter((item) => item.id === args.repoId).length !== 1 ||
        !repo
      ) {
        throw new Error('Repository owner is unavailable or ambiguous.')
      }
      if (
        isFolderRepo(repo) &&
        (args.startup ||
          args.pendingFirstAgentMessageRename ||
          args.parentWorkspace ||
          args.sparseCheckout ||
          args.pushTarget)
      ) {
        throw new Error(
          'Folder creation does not handle startup, rename reservation, parent, sparse or push settings.'
        )
      }
      const creationId = randomUUID()
      const result = await createDesktopWorktree(
        context,
        { ...args, creationId },
        'runtime',
        buildCliWorkspaceProvenance(
          {},
          { createdAt: Date.now(), startupAgent: args.createdWithAgent }
        )
      )
      await store.flushPendingOrThrowAsync()
      return {
        created: true,
        creationId,
        executionHostId: 'local',
        repoHostId: expectedRepoHostId,
        worktree: {
          id: result.worktree.id,
          repoId: result.worktree.repoId,
          path: result.worktree.path,
          branch: result.worktree.branch,
          instanceId: result.worktree.instanceId
        },
        catalogVersion: result.catalogVersion,
        ...(result.startupTerminal
          ? {
              startupTerminal: {
                spawned: result.startupTerminal.spawned,
                surface: result.startupTerminal.surface
              }
            }
          : {}),
        warning: Boolean(result.warning || result.warnings?.length)
      }
    } catch {
      throw new Error('Desktop workspace creation failed.')
    }
  })
}
