// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applySetupGuideHideRequest } from './setup-guide-hide-command'
import { SetupGuideParams } from '../../../shared/rpc-contract/setup-guide-params'
import { publishSettingsViewerView } from './settings-viewer-view'

const fixture = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  return {
    state: {
      settings,
      persistedUIReady: true,
      activeModal: 'setup-guide',
      modalData: { telemetrySource: 'help_menu' },
      setupGuideSidebarDismissed: false
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
let dialog: HTMLElement
let button: HTMLButtonElement
let ready = true
const clicks = vi.fn<() => void>()
const notify = () => fixture.listeners.forEach((listener) => listener())
const request = () => ({
  id: 'r',
  expiresAt: Date.now() + 9000,
  command: { viewer: 'host' as const, operation: 'hide-sidebar' as const }
})
const apply = () => applySetupGuideHideRequest(request(), () => ready)
beforeEach(() => {
  vi.useFakeTimers()
  ready = true
  Object.assign(fixture.state, {
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    activeModal: 'setup-guide',
    modalData: { telemetrySource: 'help_menu' },
    setupGuideSidebarDismissed: false
  })
  publishSettingsViewerView(null)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 100)
  )
  dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  Object.assign(dialog.dataset, {
    setupGuideDialog: 'true',
    setupGuideOpen: 'true',
    setupGuideSource: 'help_menu',
    setupGuideStep: 'browser',
    setupGuideSelectionRevision: '0'
  })
  dialog.innerHTML =
    '<button data-setup-guide-hide-sidebar="true">Hide</button><button data-setup-guide-step-id="browser" aria-current="step">Browser</button><section data-setup-guide-content-step="browser"><h3>Browser</h3><p data-setup-guide-description="true">Use the browser.</p><div data-setup-guide-action="true"><button>Install</button></div></section>'
  document.body.append(dialog)
  const target = dialog.querySelector('button')
  if (!(target instanceof HTMLButtonElement)) {
    throw new Error('missing fixture button')
  }
  button = target
  clicks.mockReset()
  clicks.mockImplementation(() => {
    fixture.state.setupGuideSidebarDismissed = true
    notify()
  })
  button.addEventListener('click', clicks)
})
afterEach(() => {
  document.body.replaceChildren()
  fixture.listeners.clear()
  publishSettingsViewerView(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it('accepts only the strict fixed hide operation', () => {
  expect(SetupGuideParams.safeParse(request().command).success).toBe(true)
  expect(SetupGuideParams.safeParse({ ...request().command, dismissed: false }).success).toBe(false)
})
it('clicks the original button once and reports only optimistic state with unchanged content', async () => {
  expect(await apply()).toMatchObject({
    applied: true,
    stepId: 'browser',
    sidebarDismissed: true,
    changed: true,
    writeOutcome: 'unverified',
    diskPersistence: 'unverified'
  })
  expect(clicks).toHaveBeenCalledTimes(1)
  expect(dialog.dataset.setupGuideSelectionRevision).toBe('0')
  expect(fixture.listeners.size).toBe(0)
})
it('still uses the original button for the same value without claiming a new write', async () => {
  fixture.state.setupGuideSidebarDismissed = true
  expect(await apply()).toMatchObject({ applied: true, changed: false, writeOutcome: 'unverified' })
  expect(clicks).toHaveBeenCalledTimes(1)
})
it.each(['closed', 'source', 'missing', 'duplicate', 'disabled', 'hidden', 'remote', 'root'])(
  'rejects %s before dispatch',
  async (kind) => {
    if (kind === 'closed') {
      dialog.dataset.setupGuideOpen = 'false'
    }
    if (kind === 'source') {
      dialog.dataset.setupGuideSource = 'sidebar'
    }
    if (kind === 'missing') {
      button.remove()
    }
    if (kind === 'duplicate') {
      dialog.append(button.cloneNode(true))
    }
    if (kind === 'disabled') {
      button.disabled = true
    }
    if (kind === 'hidden') {
      button.hidden = true
    }
    if (kind === 'remote') {
      fixture.state.settings.activeRuntimeEnvironmentId = 'ssh'
    }
    if (kind === 'root') {
      ready = false
    }
    await expect(apply()).rejects.toThrow()
    expect(clicks).not.toHaveBeenCalled()
  }
)
it.each(['revision', 'step', 'remove', 'runtime', 'dismissal'])(
  'refuses synchronous %s supersession',
  async (kind) => {
    button.removeEventListener('click', clicks)
    button.addEventListener('click', () => {
      fixture.state.setupGuideSidebarDismissed = true
      notify()
      if (kind === 'revision') {
        dialog.dataset.setupGuideSelectionRevision = '1'
      }
      if (kind === 'step') {
        dialog.dataset.setupGuideStep = 'default-agent'
      }
      if (kind === 'remove') {
        dialog.remove()
        document.body.append(dialog)
      }
      if (kind === 'runtime') {
        fixture.state.settings.activeRuntimeEnvironmentId = 'ssh'
        notify()
        fixture.state.settings.activeRuntimeEnvironmentId = null
      }
      if (kind === 'dismissal') {
        fixture.state.setupGuideSidebarDismissed = false
        notify()
        fixture.state.setupGuideSidebarDismissed = true
        notify()
      }
    })
    expect(await apply()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  }
)
it('does not claim success if the original callback never changes dismissal', async () => {
  button.removeEventListener('click', clicks)
  const result = apply()
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: false, sidebarDismissed: false })
})
it('refuses expired requests without dispatch', async () => {
  await expect(
    applySetupGuideHideRequest({ ...request(), expiresAt: Date.now() }, () => ready)
  ).rejects.toThrow('request_expired')
  expect(clicks).not.toHaveBeenCalled()
})
