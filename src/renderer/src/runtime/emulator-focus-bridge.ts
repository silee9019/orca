import { useAppStore } from '@/store'
import { ensureSimulatorTab } from '@/lib/ensure-simulator-tab'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { EmulatorFocusRequest, EmulatorFocusResult } from '../../../shared/emulator-focus'
import { applyEmulatorFrame } from './emulator-frame-bridge'

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
  if (!api?.onFocusRequest || !api.respondFocus) {
    return () => {}
  }
  let queue = Promise.resolve()
  let disposed = false
  const enqueue = (
    request: EmulatorFocusRequest,
    apply: (request: EmulatorFocusRequest) => Promise<EmulatorFocusResult>,
    error: string
  ) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        if (Date.now() >= request.expiresAt) {
          throw new Error('request_expired')
        }
        const result = await apply(request)
        if (!disposed) {
          api.respondFocus?.(
            Date.now() < request.expiresAt
              ? { id: request.id, ok: true, result }
              : { id: request.id, ok: false, error }
          )
        }
      } catch {
        if (!disposed) {
          api.respondFocus?.({ id: request.id, ok: false, error })
        }
      }
    })
  }
  const focus = api.onFocusRequest((request) => {
    enqueue(request, applyEmulatorFocus, 'viewer_focus_not_applied')
  })
  const frame = api.onFrameRequest?.((request) => {
    enqueue(request, applyEmulatorFrame, 'emulator_frame_not_applied')
  })
  return () => {
    if (disposed) {
      return
    }
    disposed = true
    focus()
    frame?.()
  }
}
