import { shouldPreventResourceKillDismissal } from '../components/status-bar/resource-kill-dialog-dismissal'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { flushSync } from 'react-dom'
import { ResourceViewerActionSchema } from '../../../shared/resource-manager-command'
import type { useResourceUsageStatusController } from '../components/status-bar/use-resource-usage-status-controller'
import { snapshotKillAllTerminalSurfaceIds } from '../components/shared/kill-all-terminal-surfaces'
import { selectUnboundDaemonSessions } from '../components/status-bar/resource-session-bindings'
import { ORPHAN_WORKTREE_ID } from '../../../shared/constants'
import { UNATTRIBUTED_REPO_ID } from '../components/status-bar/mergeSnapshotAndSessions'

export type ResourceManagerViewerController = ReturnType<typeof useResourceUsageStatusController>
const controllers = new Set<ResourceManagerViewerController>()

export function attachResourceManagerViewerController(
  controller: ResourceManagerViewerController
): () => void {
  controllers.add(controller)
  return () => {
    controllers.delete(controller)
  }
}
function requireController(): ResourceManagerViewerController {
  if (controllers.size === 0) {
    throw new Error('resource_manager_unavailable')
  }
  if (controllers.size !== 1) {
    throw new Error('resource_manager_ambiguous')
  }
  const controller = controllers.values().next().value
  if (!controller) {
    throw new Error('resource_manager_unavailable')
  }
  return controller
}
function readState() {
  const c = requireController()
  return {
    open: c.open,
    sort: c.sortOption,
    appCollapsed: c.appCollapsed,
    collapsedRepoIds: [...c.collapsedRepos],
    collapsedWorktreeIds: [...c.collapsedWorktrees],
    activeWorktreeId: c.activeWorktreeId,
    killConfirm: c.killConfirm,
    killing: c.killing,
    daemonPending: c.daemonActions.pending,
    daemonBusy: c.daemonActions.isBusy,
    daemonUnreachable: c.daemonUnreachable,
    sessionsOnlyError: c.sessionsOnlyError,
    repos: c.unifiedRepos,
    snapshot: c.resourceSnapshot,
    orphanSessionIds: selectUnboundDaemonSessions(
      c.sessionInventory.sessions,
      c.resourceSessionBindings
    ).map((s) => s.id),
    terminalSurfaceIds: snapshotKillAllTerminalSurfaceIds()
  }
}
function sameIds(expected: readonly string[], actual: readonly string[]): boolean {
  return (
    new Set(expected).size === expected.length &&
    expected.length === actual.length &&
    expected.every((id) => actual.includes(id))
  )
}

async function readSessionVerdicts(ids: readonly string[]) {
  const sessions = await Promise.all(
    ids.map(async (sessionId) => {
      let alive: boolean | null = null
      try {
        alive = await window.api.pty.hasPty(sessionId)
      } catch {
        /* unavailable execution host */
      }
      return {
        sessionId,
        verdict:
          alive === true
            ? ('live' as const)
            : alive === false
              ? ('exited' as const)
              : ('unverifiable' as const)
      }
    })
  )
  const verdict =
    sessions.length > 0 && sessions.every((s) => s.verdict === 'exited')
      ? 'exited'
      : sessions.some((s) => s.verdict === 'live')
        ? 'live'
        : 'unverifiable'
  return { verdict, sessions }
}

export async function applyResourceManagerViewerAction(input: unknown): Promise<unknown> {
  const action = ResourceViewerActionSchema.parse(input)
  const c = requireController()
  const rows = c.unifiedRepos.flatMap((repo) => repo.worktrees)
  const sessions = rows.flatMap((row) => row.sessions)
  const needOpen = (): void => {
    if (!c.open) {
      throw new Error('resource_manager_closed')
    }
  }
  const worktree = (id: string) => {
    needOpen()
    const matches = rows.filter((row) => row.worktreeId === id)
    if (
      matches.length !== 1 ||
      id === ORPHAN_WORKTREE_ID ||
      id.startsWith(`${UNATTRIBUTED_REPO_ID}::`)
    ) {
      throw new Error('resource_workspace_unavailable')
    }
    return matches[0]
  }
  const session = (id: string, pid?: number) => {
    needOpen()
    const matches = sessions.filter(
      (row) => row.sessionId === id && (pid === undefined || row.pid === pid)
    )
    if (matches.length !== 1) {
      throw new Error('resource_session_changed')
    }
    return matches[0]
  }
  switch (action.action) {
    case 'status':
      return readState()
    case 'set-open':
      flushSync(() => {
        if (action.open) {
          c.recordFeatureInteraction('resource-manager')
        }
        c.setOpen(action.open)
      })
      break
    case 'set-sort':
      flushSync(() => c.setSortOption(action.sort))
      break
    case 'set-app-collapsed':
      flushSync(() => c.setAppCollapsed(action.collapsed))
      break
    case 'toggle-repo':
      needOpen()
      if (!c.unifiedRepos.some((repo) => repo.repoId === action.repoId)) {
        throw new Error('resource_repo_unavailable')
      }
      flushSync(() => c.toggleRepo(action.repoId))
      break
    case 'toggle-worktree':
      worktree(action.worktreeId)
      flushSync(() => c.toggleWorktree(action.worktreeId))
      break
    case 'navigate-worktree':
      worktree(action.worktreeId)
      c.navigateToWorktree(action.worktreeId)
      return { requested: true, target: action.worktreeId }
    case 'navigate-session': {
      const target = session(action.sessionId)
      if (!target.tabId) {
        throw new Error('resource_session_unbound')
      }
      c.navigateToTab(target.tabId, target.paneKey)
      return { requested: true, target: target.sessionId }
    }
    case 'delete-worktree':
      worktree(action.worktreeId)
      if (parseWorkspaceKey(action.worktreeId)?.type === 'folder') {
        throw new Error('folder_workspace_delete_unsupported')
      }
      c.deleteWorktree(action.worktreeId)
      return { requested: true, phase: 'submitted', target: action.worktreeId }
    case 'open-cleanup':
      c.handleOpenWorkspaceCleanup()
      return { requested: true, phase: 'awaiting-confirmation' }
    case 'open-space':
      c.openSpaceResults()
      return { requested: true }
    case 'prepare-kill': {
      const target = session(action.sessionId, action.pid)
      flushSync(() => c.setKillConfirm(target))
      break
    }
    case 'dismiss-kill':
      if (shouldPreventResourceKillDismissal(c.killing)) {
        return { prevented: true, state: readState() }
      }
      flushSync(() => c.setKillConfirm(null))
      return { prevented: false, state: readState() }
    case 'cancel-kill':
      if (shouldPreventResourceKillDismissal(c.killing)) {
        throw new Error('resource_kill_busy')
      }
      flushSync(() => c.setKillConfirm(null))
      break
    case 'confirm-kill':
      session(action.sessionId, action.pid)
      if (
        c.killing ||
        c.killConfirm?.sessionId !== action.sessionId ||
        c.killConfirm.pid !== action.pid
      ) {
        throw new Error('resource_kill_confirmation_changed')
      }
      await c.runKillConfirmed()
      return {
        settled: true,
        ...(await readSessionVerdicts([action.sessionId])),
        state: readState()
      }
    case 'kill-orphans': {
      needOpen()
      if (!c.workspaceSessionReady) {
        throw new Error('resource_inventory_not_ready')
      }
      const ids = selectUnboundDaemonSessions(
        c.sessionInventory.sessions,
        c.resourceSessionBindings
      ).map((row) => row.id)
      if (!sameIds(action.expectedSessionIds, ids)) {
        throw new Error('resource_orphan_set_changed')
      }
      await c.handleKillOrphans()
      return { settled: true, ...(await readSessionVerdicts(ids)), sessionIds: ids }
    }
    case 'prepare-daemon':
      if (c.daemonActions.isBusy) {
        throw new Error('resource_daemon_busy')
      }
      flushSync(() => c.daemonActions.setPending(action.kind))
      break
    case 'cancel-daemon':
      if (c.daemonActions.isBusy) {
        throw new Error('resource_daemon_busy')
      }
      flushSync(() => c.daemonActions.setPending(null))
      break
    case 'confirm-daemon': {
      if (c.daemonActions.isBusy || c.daemonActions.pending !== action.kind) {
        throw new Error('resource_daemon_confirmation_changed')
      }
      if (!sameIds(action.expectedSurfaceIds, snapshotKillAllTerminalSurfaceIds())) {
        throw new Error('resource_terminal_surface_set_changed')
      }
      const sessionIds = c.sessionInventory.sessions.map((s) => s.id)
      await (action.kind === 'restart'
        ? c.daemonActions.runRestart()
        : c.daemonActions.runKillAll())
      return { settled: true, ...(await readSessionVerdicts(sessionIds)), state: readState() }
    }
  }
  return readState()
}
