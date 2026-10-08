import { useAppStore } from '@/store'
import { useEffect, useRef } from 'react'
import { openMobileEmulatorHiddenToastSettings } from '@/components/emulator-pane/mobile-emulator-hidden-toast'
import type {
  ConnectionsViewerRequest,
  EmulatorConnectionsViewerResult,
  EmulatorConnectionsViewerState
} from '../../../shared/connections-viewer'
import { EmulatorConnectionsViewerParams } from '../../../shared/rpc-contract/connections-viewer-params'
export type EmulatorConnectionsViewerController = {
  surface: 'intro' | 'guide'
  worktreeId?: string
  read: () => EmulatorConnectionsViewerState
  keep: () => void
  hide: () => void
  dismiss: () => void
  expand: (open: boolean) => void
  settings: () => void
  persisted: (kind: 'intro' | 'guide' | 'hide') => Promise<boolean>
}
export function readEmulatorConnectionsViewerState(
  expanded: boolean | null = null
): EmulatorConnectionsViewerState {
  const state = useAppStore.getState()
  return {
    introDismissed: state.mobileEmulatorTabIntroDismissed,
    guideDismissed: state.mobileEmulatorAgentSetupDismissed,
    enabled: state.settings?.mobileEmulatorEnabled !== false,
    expanded,
    settingsOpen:
      state.activeView === 'settings' && state.settingsNavigationTarget?.pane === 'mobile-emulator'
  }
}
const controllers = new Set<EmulatorConnectionsViewerController>()
type GuideSkillOwner = {
  worktreeId: string
  refresh: () => Promise<object | null>
  read: () => { completion: object | null; ready: boolean; loading: boolean; error: boolean }
}
const guideSkills = new Set<GuideSkillOwner>()
export function useEmulatorGuideSkillViewer(owner: GuideSkillOwner): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    const current = {
      worktreeId: owner.worktreeId,
      refresh: () => committed.current.refresh(),
      read: () => committed.current.read()
    }
    guideSkills.add(current)
    return () => {
      guideSkills.delete(current)
    }
  }, [owner.worktreeId])
}
export function mountEmulatorConnectionsViewerController(
  controller: EmulatorConnectionsViewerController
): () => void {
  controllers.add(controller)
  return () => {
    controllers.delete(controller)
  }
}
export async function applyEmulatorConnectionsViewerRequest(
  request: ConnectionsViewerRequest
): Promise<EmulatorConnectionsViewerResult> {
  const parsed = EmulatorConnectionsViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const command = parsed.data
  if (command.operation === 'emulator.guide-recheck') {
    const selected = [...guideSkills].filter((owner) => owner.worktreeId === command.worktreeId)
    if (selected.length > 1) {
      throw new Error('connections_viewer_ambiguous')
    }
    const owner = selected[0]
    if (!owner) {
      throw new Error('connections_surface_unavailable')
    }
    const completion = await owner.refresh().catch(() => null)
    while (
      completion &&
      guideSkills.has(owner) &&
      Date.now() < request.expiresAt &&
      (owner.read().completion !== completion || owner.read().loading)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const current = owner.read()
    return {
      viewerId: command.viewerId,
      persisted: null,
      applied:
        completion !== null &&
        current.completion === completion &&
        !current.loading &&
        !current.error &&
        guideSkills.has(owner) &&
        Date.now() < request.expiresAt,
      state: {
        ...readEmulatorConnectionsViewerState(),
        skillReady: current.ready,
        skillChecking: current.loading
      }
    }
  }
  if (command.operation === 'emulator.hidden-settings') {
    const store = useAppStore.getState()
    const dismissed = openMobileEmulatorHiddenToastSettings(store)
    const state = readEmulatorConnectionsViewerState()
    return {
      viewerId: command.viewerId,
      applied: dismissed && state.settingsOpen,
      persisted: null,
      state
    }
  }
  const surface = command.operation.startsWith('emulator.intro-') ? 'intro' : 'guide'
  const matches = [...controllers].filter(
    (value) =>
      value.surface === surface &&
      (!('worktreeId' in command) || value.worktreeId === command.worktreeId)
  )
  const controller = matches[0]
  if (!controller) {
    throw new Error('connections_surface_unavailable')
  }
  if (matches.length !== 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  let persistence: 'intro' | 'guide' | 'hide' | null = null
  const expected: Partial<EmulatorConnectionsViewerState> = {}
  switch (command.operation) {
    case 'emulator.intro-get':
    case 'emulator.guide-get':
      break
    case 'emulator.intro-keep':
      controller.keep()
      expected.introDismissed = true
      persistence = 'intro'
      break
    case 'emulator.intro-dismiss':
      controller.dismiss()
      expected.introDismissed = true
      persistence = 'intro'
      break
    case 'emulator.intro-hide':
      controller.hide()
      expected.enabled = false
      expected.introDismissed = true
      persistence = 'hide'
      break
    case 'emulator.guide-dismiss':
      controller.dismiss()
      expected.guideDismissed = true
      persistence = 'guide'
      break
    case 'emulator.guide-expand':
      controller.expand(command.open)
      expected.expanded = command.open
      break
    case 'emulator.guide-settings':
      controller.settings()
      expected.settingsOpen = true
      break
  }
  let persisted: boolean | null = persistence ? false : null
  while (Date.now() < request.expiresAt && controllers.has(controller)) {
    let state = controller.read()
    const applied = Object.entries(expected).every(
      ([key, value]) => Reflect.get(state, key) === value
    )
    if (applied) {
      persisted = persistence ? await controller.persisted(persistence).catch(() => false) : null
      state = controller.read()
      if (
        persisted !== false &&
        controllers.has(controller) &&
        Date.now() < request.expiresAt &&
        Object.entries(expected).every(([key, value]) => Reflect.get(state, key) === value)
      ) {
        return { viewerId: command.viewerId, applied: true, persisted, state }
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
  }
  return {
    viewerId: command.viewerId,
    applied: false,
    persisted,
    state: controller.read(),
    reason: persistence ? 'persistence_not_confirmed' : 'viewer_not_applied'
  }
}
