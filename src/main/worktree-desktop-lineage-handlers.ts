import { ipcMain } from 'electron'
import type { z } from 'zod'
import type { DesktopWorktreeLineageUpdate } from '../shared/rpc-contract/workspace-lineage-params'
import { getRepoIdFromWorktreeId } from '../shared/worktree/id'
import { getRepoExecutionHostId } from '../shared/execution-host'
import { getRepoForExecutionHost } from './repo-execution-host-selection'
import { notifyWorktreesChanged } from './ipc/worktree-remote'
import { parseWorktreeId } from './ipc/worktree-logic'
import type { WorktreeIpcContext } from './ipc/worktrees/worktree-ipc-context'
import { setDesktopLineageForRpc } from './runtime/rpc/methods/workspace-lineage'

type Context = Pick<WorktreeIpcContext, 'store' | 'runtime' | 'mainWindow'>
type Target = z.infer<typeof DesktopWorktreeLineageUpdate>['target']
type DesktopArgs = { worktreeId: string; parentWorktreeId?: string; noParent?: boolean }

function lineageTargetSelector(target: Target): string {
  return 'identityKey' in target ? `identity:${target.identityKey}` : `id:${target.worktreeId}`
}

async function requireLineageTarget({ store, runtime }: Context, target: Target) {
  const repoId = getRepoIdFromWorktreeId(target.worktreeId)
  const owner = getRepoForExecutionHost(store, repoId, target.executionHostId)
  if (
    target.executionHostId.startsWith('runtime:') ||
    store.getRepos().filter((repo) => repo.id === repoId).length !== 1 ||
    !owner
  ) {
    throw new Error('Workspace lineage owner is unavailable or ambiguous.')
  }
  if ('instanceId' in target && owner.kind !== 'folder') {
    throw new Error('Instance-only lineage selection requires a folder repository.')
  }
  const worktree = await runtime.showManagedWorktree(lineageTargetSelector(target))
  if (
    'instanceId' in target &&
    store.getWorktreeMetaForHost(target.worktreeId, target.executionHostId)?.instanceId !==
      target.instanceId
  ) {
    throw new Error('Persisted folder instance changed.')
  }
  const hostId =
    worktree.identity?.executionHostId ?? worktree.hostId ?? getRepoExecutionHostId(owner)
  if (
    worktree.id !== target.worktreeId ||
    worktree.repoId !== owner.id ||
    ('identityKey' in target
      ? worktree.identity?.key !== target.identityKey
      : worktree.instanceId !== target.instanceId) ||
    hostId !== target.executionHostId ||
    !worktree.instanceId
  ) {
    throw new Error('Workspace lineage instance changed.')
  }
  return worktree
}

export function registerDesktopWorktreeLineageHandlers(context: Context): void {
  const { store, runtime, mainWindow } = context
  const update = async (
    args: DesktopArgs,
    selector = args.worktreeId,
    parentSelector = args.parentWorktreeId ? `id:${args.parentWorktreeId}` : undefined
  ) => {
    await runtime.updateManagedWorktreeMeta(selector, {
      lineage:
        args.noParent === true
          ? { noParent: true }
          : parentSelector
            ? { parentWorktree: parentSelector }
            : undefined
    })
    notifyWorktreesChanged(mainWindow, parseWorktreeId(args.worktreeId).repoId)
    return store.getWorktreeLineage(args.worktreeId) ?? null
  }
  ipcMain.handle('worktrees:updateLineage', (_event, args: DesktopArgs) => update(args))
  setDesktopLineageForRpc(async (args) => {
    try {
      const child = await requireLineageTarget(context, args.target)
      if (args.parent) {
        await requireLineageTarget(context, args.parent)
      }
      const edge = store.getWorktreeLineage(child.id)
      if (edge && edge.worktreeInstanceId !== child.instanceId) {
        throw new Error('Stored lineage belongs to another workspace instance.')
      }
      const lineage = await update(
        { worktreeId: child.id, noParent: args.noParent },
        lineageTargetSelector(args.target),
        args.parent ? lineageTargetSelector(args.parent) : undefined
      )
      await store.flushPendingOrThrowAsync()
      return lineage
    } catch {
      throw new Error('Desktop workspace lineage update failed.')
    }
  })
}
