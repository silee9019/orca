// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyCrashReportRequest } from './crash-report-command'
import { publishCrashReportOpenSurface } from './crash-report-open-surface'
import { publishSettingsViewerView } from './settings-viewer-view'

const fixture = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  return {
    state: {
      settings,
      persistedUIReady: true,
      activeModal: 'none'
    },
    listeners: new Set<() => void>()
  }
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => fixture.state,
    subscribe: (callback: () => void) => {
      fixture.listeners.add(callback)
      return () => fixture.listeners.delete(callback)
    }
  }
}))
let epoch = 0
let ready = true
let dispose = () => {}
const open = vi.fn(() => ++epoch)
const request = () => ({
  id: 'r',
  expiresAt: Date.now() + 9000,
  command: { viewer: 'host' as const, operation: 'open' as const }
})
const apply = () => applyCrashReportRequest(request(), () => ready)
function renderReport(state: 'empty' | 'loading' | 'report' = 'empty'): HTMLElement {
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.dataset.crashReportDialog = 'true'
  dialog.dataset.crashReportOpen = 'true'
  dialog.dataset.crashReportSource = 'help_menu'
  dialog.dataset.crashReportEpoch = String(epoch)
  dialog.dataset.crashReportContentState = state
  dialog.innerHTML =
    '<h2 data-slot="dialog-title">Crash report</h2><p data-slot="dialog-description">Review before sending.</p><textarea data-crash-report-notes="true"></textarea><button data-crash-report-action="copy">Copy</button><button data-crash-report-action="dismiss">Dismiss</button><button data-crash-report-action="send">Send</button>'
  document.body.append(dialog)
  return dialog
}
beforeEach(() => {
  vi.useFakeTimers()
  epoch = 0
  ready = true
  fixture.state.activeModal = 'none'
  fixture.state.persistedUIReady = true
  fixture.state.settings.activeRuntimeEnvironmentId = null
  dispose = publishCrashReportOpenSurface({
    openFromHelp: open,
    isCurrent: (value) => value === epoch
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 100)
  )
  publishSettingsViewerView(null)
})
afterEach(() => {
  dispose()
  document.body.replaceChildren()
  fixture.listeners.clear()
  publishSettingsViewerView(null)
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.useRealTimers()
})
it.each(['empty', 'loading', 'report'] as const)(
  'acknowledges the original %s shell without exposing its report',
  async (state) => {
    const result = apply()
    await vi.advanceTimersByTimeAsync(50)
    renderReport(state)
    await vi.advanceTimersByTimeAsync(25)
    expect(await result).toEqual({
      viewer: 'host',
      source: 'help_menu',
      applied: true,
      dialogPresent: true,
      contentPresent: true,
      contentState: state
    })
    expect(open).toHaveBeenCalledExactlyOnceWith()
    expect(fixture.listeners.size).toBe(0)
  }
)
it.each(['modal', 'dialog', 'remote', 'root', 'unready', 'unmounted'])(
  'refuses %s before dispatch',
  async (kind) => {
    if (kind === 'modal') {
      fixture.state.activeModal = 'edit-meta'
    }
    if (kind === 'dialog') {
      renderReport()
    }
    if (kind === 'remote') {
      fixture.state.settings.activeRuntimeEnvironmentId = 'ssh'
    }
    if (kind === 'root') {
      ready = false
    }
    if (kind === 'unready') {
      fixture.state.persistedUIReady = false
    }
    if (kind === 'unmounted') {
      dispose()
    }
    await expect(apply()).rejects.toThrow()
    expect(open).not.toHaveBeenCalled()
  }
)
it.each(['epoch', 'unmount', 'runtime', 'root'])('keeps %s supersession sticky', async (kind) => {
  const result = apply()
  if (kind === 'epoch') {
    epoch += 1
  }
  if (kind === 'unmount') {
    dispose()
  }
  if (kind === 'runtime') {
    fixture.state.settings.activeRuntimeEnvironmentId = 'ssh'
    fixture.listeners.forEach((listener) => listener())
    fixture.state.settings.activeRuntimeEnvironmentId = null
    fixture.listeners.forEach((listener) => listener())
  }
  if (kind === 'root') {
    ready = false
  }
  renderReport()
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it.each(['closed', 'wrong-epoch', 'automatic', 'missing-controls', 'late', 'offscreen'])(
  'does not acknowledge %s content',
  async (kind) => {
    const result = apply()
    const dialog = renderReport()
    if (kind === 'closed') {
      dialog.dataset.crashReportOpen = 'false'
    }
    if (kind === 'wrong-epoch') {
      dialog.dataset.crashReportEpoch = '90'
    }
    if (kind === 'automatic') {
      dialog.dataset.crashReportSource = 'automatic'
    }
    if (kind === 'missing-controls') {
      dialog.querySelector('textarea')?.remove()
    }
    if (kind === 'late') {
      dialog.remove()
      setTimeout(renderReport, 5000)
    }
    if (kind === 'offscreen') {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(2000, 2000, 100, 100)
      )
    }
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toMatchObject({ applied: false })
  }
)
