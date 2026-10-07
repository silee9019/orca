import { useAppStore } from '@/store'
import { ensureSimulatorTab } from '@/lib/ensure-simulator-tab'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { EmulatorFocusRequest, EmulatorFocusResult } from '../../../shared/emulator-focus'

export async function applyEmulatorFocus(
  request: EmulatorFocusRequest
): Promise<EmulatorFocusResult> {
  const initial = useAppStore.getState()
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  if (!initial.persistedUIReady || !initial.settings) {
    throw new Error('viewer_not_ready')
  }
  if (initial.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  if (!initial.groupsByWorktree[request.worktreeId]?.length) {
    throw new Error('workspace_not_found')
  }
  initial.setActiveWorktree(request.worktreeId)
  const tabId = ensureSimulatorTab(request.worktreeId, {
    surfacePane: true,
    executionHostId: LOCAL_EXECUTION_HOST_ID
  })
  if (!tabId) {
    throw new Error('viewer_focus_not_applied')
  }
  const current = useAppStore.getState()
  const tab = current.unifiedTabsByWorktree[request.worktreeId]?.find((entry) => entry.id === tabId)
  if (!tab) {
    throw new Error('viewer_focus_not_applied')
  }
  await new Promise<void>((resolve, reject) => {
    let frame = 0
    const timer = setTimeout(
      () => {
        cancelAnimationFrame(frame)
        reject(new Error('viewer_focus_timeout_applied_unknown'))
      },
      Math.max(1, Math.min(5000, request.expiresAt - Date.now()))
    )
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  })
  const readback = useAppStore.getState()
  const slot = [...document.querySelectorAll<HTMLElement>('[data-emulator-tab-id]')].find(
    (element) => element.dataset.emulatorTabId === tabId
  )
  if (
    Date.now() >= request.expiresAt ||
    readback.settings?.activeRuntimeEnvironmentId ||
    readback.activeWorktreeId !== request.worktreeId ||
    readback.activeGroupIdByWorktree[request.worktreeId] !== tab.groupId ||
    readback.groupsByWorktree[request.worktreeId]?.find((group) => group.id === tab.groupId)
      ?.activeTabId !== tabId ||
    !slot ||
    getComputedStyle(slot).visibility === 'hidden' ||
    slot.getBoundingClientRect().width <= 0
  ) {
    throw new Error('viewer_focus_not_applied')
  }
  return {
    viewer: 'host',
    viewerId: 0,
    worktreeId: request.worktreeId,
    tabId,
    groupId: tab.groupId,
    applied: true
  }
}

export function attachEmulatorFocusBridge(): () => void {
  const api = window.api.emulator
  if (!api.onFocusRequest || !api.respondFocus) {
    return () => {}
  }
  let queue = Promise.resolve()
  return api.onFocusRequest((request) => {
    queue = queue.then(async () => {
      try {
        api.respondFocus?.({ id: request.id, ok: true, result: await applyEmulatorFocus(request) })
      } catch {
        api.respondFocus?.({ id: request.id, ok: false, error: 'viewer_focus_not_applied' })
      }
    })
  })
}
