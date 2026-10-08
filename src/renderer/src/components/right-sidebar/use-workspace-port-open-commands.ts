import { getLocalWorkspacePortSections } from './local-workspace-port-sections'
import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { getKnownExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { workspacePortRuntimeTargetKey } from '@/lib/workspace-port-actions'
import type { PortOpenClickEvent } from '@/lib/workspace-port-actions'
import type { WorkspacePort, WorkspacePortScanResult } from '../../../../shared/workspace-ports'
import { WorkspacePortOpenEvent } from '@/runtime/workspace-port-open-request'
type Owner = {
  isVisible: boolean
  worktreeId?: string
  repoId?: string
  scanKey: string | null
  runtimeTarget: RuntimeClientTarget | null
  scan: WorkspacePortScanResult | null
  open: (
    port: WorkspacePort,
    event?: PortOpenClickEvent,
    isCurrent?: () => boolean
  ) => Promise<({ ok: true } | { ok: false; reason: string }) & { external: boolean }>
}
export function useWorkspacePortOpenCommands(owner: Owner): void {
  const latest = useRef(owner)
  useEffect(() => {
    latest.current = owner
  }, [owner])
  useEffect(() => {
    let mounted = true
    const listener = (raw: Event) => {
      if (!(raw instanceof WorkspacePortOpenEvent)) {
        return
      }
      const event = raw
      const current = latest.current
      const command = event.command
      if (
        !current.isVisible ||
        !current.runtimeTarget ||
        current.scanKey !== `${workspacePortRuntimeTargetKey(current.runtimeTarget)}:all` ||
        current.worktreeId !== command.worktreeId ||
        getKnownExecutionHostIdForWorktree(useAppStore.getState(), current.worktreeId) !==
          command.executionHostId
      ) {
        return
      }
      event.offers.push(async () => {
        const sections = getLocalWorkspacePortSections(
          current.scan,
          current.repoId,
          command.worktreeId
        )
        const candidates = [
          ...sections.activePorts,
          ...sections.otherWorkspacePorts,
          ...sections.externalPorts
        ].filter((entry) => entry.id === command.portId)
        const port = candidates.length === 1 ? candidates[0] : undefined
        const rawPort = current.scan?.ports.find((entry) => entry.id === command.portId)
        if (!port || !current.scanKey) {
          throw new Error('workspace_port_target_unavailable')
        }
        const destinationWorktree =
          port.kind === 'workspace' ? port.owner.worktreeId : command.worktreeId
        const snapshot = JSON.stringify(rawPort)
        const isCurrent = () => {
          const state = useAppStore.getState()
          const active = state.activeWorktreeId
          return (
            mounted &&
            Date.now() < event.expiresAt &&
            latest.current.isVisible &&
            latest.current.scanKey === current.scanKey &&
            latest.current.repoId === current.repoId &&
            (latest.current.worktreeId === command.worktreeId ||
              latest.current.worktreeId === destinationWorktree) &&
            Boolean(state.getKnownWorktreeById(command.worktreeId, command.executionHostId)) &&
            (active === command.worktreeId || active === destinationWorktree) &&
            getKnownExecutionHostIdForWorktree(state, command.worktreeId) ===
              command.executionHostId &&
            JSON.stringify(
              state.workspacePortScansByKey[current.scanKey ?? '']?.ports.find(
                (entry) => entry.id === command.portId
              )
            ) === snapshot
          )
        }
        if (!isCurrent()) {
          throw new Error('workspace_port_owner_changed')
        }
        const before = new Set(
          Object.values(useAppStore.getState().browserPagesByWorkspace)
            .flat()
            .map((page) => page.id)
        )
        const isMac = navigator.userAgent.includes('Mac')
        const result = await current.open(
          port,
          command.intent === 'system'
            ? { metaKey: isMac, ctrlKey: !isMac, shiftKey: true }
            : undefined,
          isCurrent
        )
        if (!result.ok) {
          throw new Error(result.reason)
        }
        if (!isCurrent()) {
          throw new Error('workspace_port_timeout_effect_unknown')
        }
        if (result.external) {
          return { ...command, destination: 'system' }
        }
        const state = useAppStore.getState()
        const pages = Object.values(state.browserPagesByWorkspace)
          .flat()
          .filter((page) => !before.has(page.id) && page.worktreeId === destinationWorktree)
        if (pages.length !== 1) {
          throw new Error('workspace_port_open_applied_unknown')
        }
        const page = pages[0]
        const workspace = state.browserTabsByWorktree[destinationWorktree]?.find(
          (tab) => tab.id === page.workspaceId
        )
        if (workspace?.activePageId !== page.id || state.activeWorktreeId !== destinationWorktree) {
          throw new Error('workspace_port_open_applied_unknown')
        }
        const remotePageId = state.remoteBrowserPageHandlesByPageId[page.id]?.remotePageId
        return {
          ...command,
          destination: 'browser',
          pageId: page.id,
          workspaceId: page.workspaceId,
          ...(remotePageId ? { remotePageId } : {})
        }
      })
    }
    window.addEventListener('orca:workspace-port-open', listener)
    return () => {
      mounted = false
      window.removeEventListener('orca:workspace-port-open', listener)
    }
  }, [])
}
