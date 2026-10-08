import { afterEach, expect, it, vi } from 'vitest'
import {
  applyEmulatorConnectionsViewerRequest,
  mountEmulatorConnectionsViewerController,
  type EmulatorConnectionsViewerController
} from './emulator-connections-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../shared/rpc-contract/connections-viewer-params'
import type { EmulatorConnectionsViewerState } from '../../../shared/connections-viewer'
let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((fn) => fn())
  cleanup = []
})
const request = (command: ConnectionsViewerCommand, timeout = 200) => ({
  id: 'request',
  expiresAt: Date.now() + timeout,
  command
})
function fixture(surface: 'intro' | 'guide', worktreeId?: string) {
  const state: EmulatorConnectionsViewerState = {
    introDismissed: false,
    guideDismissed: false,
    enabled: true,
    expanded: surface === 'guide' ? false : null,
    settingsOpen: false
  }
  const controller: EmulatorConnectionsViewerController = {
    surface,
    worktreeId,
    read: () => ({ ...state }),
    keep: () => {
      state.introDismissed = true
    },
    hide: () => {
      state.enabled = false
      state.introDismissed = true
    },
    dismiss: () => {
      if (surface === 'intro') {
        state.introDismissed = true
      } else {
        state.guideDismissed = true
      }
    },
    expand: (open) => {
      state.expanded = open
    },
    settings: () => {
      state.settingsOpen = true
    },
    persisted: vi.fn().mockResolvedValue(true)
  }
  cleanup.push(mountEmulatorConnectionsViewerController(controller))
  return { state, controller }
}
it('targets an exact guide and observes expansion/settings/dismiss effects', async () => {
  const a = fixture('guide', 'repo::a')
  const b = fixture('guide', 'repo::b')
  expect(
    await applyEmulatorConnectionsViewerRequest(
      request({
        viewerId: 7,
        operation: 'emulator.guide-expand',
        worktreeId: 'repo::a',
        open: true
      })
    )
  ).toMatchObject({ applied: true, persisted: null, state: { expanded: true } })
  expect(b.state.expanded).toBe(false)
  await applyEmulatorConnectionsViewerRequest(
    request({ viewerId: 7, operation: 'emulator.guide-settings', worktreeId: 'repo::a' })
  )
  expect(a.state.settingsOpen).toBe(true)
  expect(b.state.settingsOpen).toBe(false)
  expect(
    await applyEmulatorConnectionsViewerRequest(
      request({ viewerId: 7, operation: 'emulator.guide-dismiss', worktreeId: 'repo::a' })
    )
  ).toMatchObject({ applied: true, persisted: true })
})
it('does not confirm optimistic dismissal when persistent readback fails', async () => {
  const { controller } = fixture('intro')
  vi.mocked(controller.persisted).mockResolvedValue(false)
  expect(
    await applyEmulatorConnectionsViewerRequest(
      request({ viewerId: 7, operation: 'emulator.intro-dismiss' }, 35)
    )
  ).toMatchObject({
    applied: false,
    persisted: false,
    reason: 'persistence_not_confirmed',
    state: { introDismissed: true }
  })
})
it('waits for a committed hide and confirms persistent setting plus dismissal', async () => {
  const { controller, state } = fixture('intro')
  controller.hide = () => {
    setTimeout(() => {
      state.enabled = false
      state.introDismissed = true
    }, 20)
  }
  expect(
    await applyEmulatorConnectionsViewerRequest(
      request({ viewerId: 7, operation: 'emulator.intro-hide' })
    )
  ).toMatchObject({
    applied: true,
    persisted: true,
    state: { enabled: false, introDismissed: true }
  })
})
it('rejects expired, unmounted, and ambiguous controls before invoking them', async () => {
  await expect(
    applyEmulatorConnectionsViewerRequest(
      request({ viewerId: 7, operation: 'emulator.intro-keep' }, -1)
    )
  ).rejects.toThrow('request_expired')
  await expect(
    applyEmulatorConnectionsViewerRequest(
      request({ viewerId: 7, operation: 'emulator.guide-get', worktreeId: 'missing' })
    )
  ).rejects.toThrow('connections_surface_unavailable')
  fixture('intro')
  fixture('intro')
  await expect(
    applyEmulatorConnectionsViewerRequest(
      request({ viewerId: 7, operation: 'emulator.intro-keep' })
    )
  ).rejects.toThrow('connections_viewer_ambiguous')
})

it('rechecks current UI state after asynchronous persistent readback before acknowledging hide', async () => {
  const { controller, state } = fixture('intro')
  vi.mocked(controller.persisted).mockImplementationOnce(async () => {
    state.enabled = true
    return true
  })
  expect(
    await applyEmulatorConnectionsViewerRequest(
      request({ viewerId: 7, operation: 'emulator.intro-hide' }, 40)
    )
  ).toMatchObject({ applied: false, persisted: true, state: { enabled: true } })
})
