import { dispatchEmulatorPaletteSelect } from './emulator-palette-command'
import { useAppStore } from '@/store'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { EmulatorFrameActionSchema } from '../../../shared/emulator-frame-command'
import type { EmulatorFocusRequest, EmulatorFocusResult } from '../../../shared/emulator-focus'
import { dispatchEmulatorFrameCommand } from '../components/emulator-pane/emulator-frame-command'

export async function applyEmulatorFrame(
  request: EmulatorFocusRequest
): Promise<EmulatorFocusResult> {
  const state = useAppStore.getState()
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  if (!state.persistedUIReady || !state.settings) {
    throw new Error('viewer_not_ready')
  }
  if (state.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  if (!request.frame) {
    throw new Error('invalid_frame_request')
  }
  const action = EmulatorFrameActionSchema.parse(request.frame.action)
  const matchingTabs =
    state.unifiedTabsByWorktree[request.worktreeId]?.filter(
      (entry) => entry.id === request.frame?.tabId
    ) ?? []
  if (matchingTabs.length !== 1) {
    throw new Error('emulator_frame_unavailable')
  }
  const tab = matchingTabs[0]
  if (action.type === 'select-tab') {
    if (!tab || tab.contentType !== 'simulator' || tab.executionHostId !== action.executionHostId) {
      throw new Error('emulator_frame_unavailable')
    }
    dispatchEmulatorPaletteSelect({
      worktreeId: request.worktreeId,
      tabId: tab.id,
      executionHostId: action.executionHostId
    })
    const current = useAppStore.getState()
    if (
      Date.now() >= request.expiresAt ||
      current.settings?.activeRuntimeEnvironmentId ||
      current.activeWorktreeId !== request.worktreeId ||
      current.activeGroupIdByWorktree[request.worktreeId] !== tab.groupId ||
      current.groupsByWorktree[request.worktreeId]?.find((group) => group.id === tab.groupId)
        ?.activeTabId !== tab.id ||
      current.activeModal !== 'none'
    ) {
      throw new Error('emulator_selection_not_applied')
    }
    return {
      viewer: 'host',
      viewerId: 0,
      worktreeId: request.worktreeId,
      tabId: tab.id,
      groupId: tab.groupId,
      applied: true
    }
  }
  if (
    !tab ||
    tab.contentType !== 'simulator' ||
    (action.type !== 'focus-group' && tab.executionHostId !== LOCAL_EXECUTION_HOST_ID) ||
    state.activeWorktreeId !== request.worktreeId ||
    state.groupsByWorktree[request.worktreeId]?.find((group) => group.id === tab.groupId)
      ?.activeTabId !== tab.id
  ) {
    throw new Error('emulator_frame_unavailable')
  }
  const slot = [...document.querySelectorAll<HTMLElement>('[data-emulator-tab-id]')].find(
    (element) => element.dataset.emulatorTabId === tab.id
  )
  if (
    !slot ||
    getComputedStyle(slot).visibility === 'hidden' ||
    slot.getBoundingClientRect().width <= 0
  ) {
    throw new Error('emulator_frame_unavailable')
  }
  if (action.type === 'focus-group') {
    if (action.groupId !== tab.groupId) {
      throw new Error('emulator_group_mismatch')
    }
    state.focusGroup(request.worktreeId, action.groupId)
    if (useAppStore.getState().activeGroupIdByWorktree[request.worktreeId] !== action.groupId) {
      throw new Error('emulator_group_not_applied')
    }
    return {
      viewer: 'host',
      viewerId: 0,
      worktreeId: request.worktreeId,
      tabId: tab.id,
      groupId: action.groupId,
      applied: true
    }
  }
  const frameState = await dispatchEmulatorFrameCommand(slot, action)
  const readback = useAppStore.getState()
  if (
    Date.now() >= request.expiresAt ||
    !slot.isConnected ||
    readback.settings?.activeRuntimeEnvironmentId ||
    readback.activeWorktreeId !== request.worktreeId ||
    readback.groupsByWorktree[request.worktreeId]?.find((group) => group.id === tab.groupId)
      ?.activeTabId !== tab.id
  ) {
    throw new Error('emulator_frame_applied_unknown')
  }
  return {
    viewer: 'host',
    viewerId: 0,
    worktreeId: request.worktreeId,
    tabId: tab.id,
    groupId: tab.groupId,
    applied: true,
    frameState
  }
}
