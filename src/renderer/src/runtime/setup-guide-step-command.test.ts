// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applySetupGuideStepRequest } from './setup-guide-step-command'
import { publishSettingsViewerView } from './settings-viewer-view'

const fixture = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  const modalData: Record<string, unknown> = { telemetrySource: 'help_menu' }
  return {
    state: { settings, persistedUIReady: true, activeModal: 'setup-guide', modalData },
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
let ready = true
let dialog: HTMLElement
let target: HTMLButtonElement
const clicks = vi.fn<() => void>()
const request = () => ({
  id: 'r',
  expiresAt: Date.now() + 9000,
  command: {
    viewer: 'host' as const,
    operation: 'select-step' as const,
    stepId: 'browser' as const
  }
})
const apply = () => applySetupGuideStepRequest(request(), () => ready)
function commit(step = 'browser', revision = 1): void {
  dialog.dataset.setupGuideStep = step
  dialog.dataset.setupGuideSelectionRevision = String(revision)
  target.setAttribute('aria-current', 'step')
  dialog.querySelector('section')?.setAttribute('data-setup-guide-content-step', step)
}
beforeEach(() => {
  vi.useFakeTimers()
  ready = true
  fixture.state.settings.activeRuntimeEnvironmentId = null
  fixture.state.persistedUIReady = true
  fixture.state.activeModal = 'setup-guide'
  fixture.state.modalData = { telemetrySource: 'help_menu' }
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
    setupGuideStep: 'default-agent',
    setupGuideSelectionRevision: '0'
  })
  dialog.innerHTML =
    '<button data-setup-guide-step-id="browser">Browser</button><section data-setup-guide-content-step="default-agent"><h3>Browser</h3><p data-setup-guide-description="true">Use the browser.</p><div data-setup-guide-action="true"><button>Install skill</button></div></section>'
  document.body.append(dialog)
  const button = dialog.querySelector('button')
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('fixture target missing')
  }
  target = button
  clicks.mockReset()
  clicks.mockImplementation(() => commit())
  target.addEventListener('click', clicks)
})
afterEach(() => {
  document.body.replaceChildren()
  fixture.listeners.clear()
  publishSettingsViewerView(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it('uses the exact original row once and acknowledges its content commit', async () => {
  expect(await apply()).toMatchObject({
    viewer: 'host',
    applied: true,
    source: 'help_menu',
    stepId: 'browser',
    contentPresent: true
  })
  expect(clicks).toHaveBeenCalledTimes(1)
  expect(fixture.listeners.size).toBe(0)
})
it('still invokes the original callback when the target is already selected', async () => {
  commit('browser', 0)
  expect(await apply()).toMatchObject({ applied: true, stepId: 'browser' })
  expect(clicks).toHaveBeenCalledTimes(1)
  expect(dialog.dataset.setupGuideSelectionRevision).toBe('1')
})
it.each([
  'closed',
  'modal',
  'source',
  'missing',
  'duplicate',
  'disabled',
  'offscreen',
  'root',
  'remote',
  'revision'
])('refuses %s before dispatch', async (kind) => {
  if (kind === 'closed') {
    dialog.dataset.setupGuideOpen = 'false'
  }
  if (kind === 'modal') {
    fixture.state.activeModal = 'none'
  }
  if (kind === 'source') {
    dialog.dataset.setupGuideSource = 'sidebar'
  }
  if (kind === 'missing') {
    target.remove()
  }
  if (kind === 'duplicate') {
    dialog.append(target.cloneNode(true))
  }
  if (kind === 'disabled') {
    target.disabled = true
  }
  if (kind === 'offscreen') {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(2000, 2000, 100, 100)
    )
  }
  if (kind === 'root') {
    ready = false
  }
  if (kind === 'remote') {
    fixture.state.settings.activeRuntimeEnvironmentId = 'ssh'
  }
  if (kind === 'revision') {
    dialog.dataset.setupGuideSelectionRevision = 'unknown'
  }
  await expect(apply()).rejects.toThrow()
  expect(clicks).not.toHaveBeenCalled()
})
it.each(['revision', 'remove', 'runtime', 'data', 'root'])(
  'refuses %s supersession while waiting for content',
  async (kind) => {
    target.removeEventListener('click', clicks)
    target.addEventListener('click', () => {
      commit()
      dialog.querySelector('h3')?.replaceChildren()
    })
    const result = apply()
    if (kind === 'revision') {
      commit('default-agent', 2)
      commit('browser', 3)
    }
    if (kind === 'remove') {
      dialog.remove()
      document.body.append(dialog)
    }
    if (kind === 'runtime') {
      fixture.state.settings.activeRuntimeEnvironmentId = 'ssh'
      fixture.listeners.forEach((fn) => fn())
      fixture.state.settings.activeRuntimeEnvironmentId = null
    }
    if (kind === 'data') {
      fixture.state.modalData = { telemetrySource: 'help_menu' }
      fixture.listeners.forEach((fn) => fn())
    }
    if (kind === 'root') {
      ready = false
    }
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  }
)
it('does not acknowledge a click that never commits a new revision', async () => {
  target.removeEventListener('click', clicks)
  target.addEventListener('click', () => commit('browser', 0))
  const result = apply()
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: false })
})

it('rejects synchronous removal and reinsertion by the original callback', async () => {
  target.removeEventListener('click', clicks)
  target.addEventListener('click', () => {
    commit()
    dialog.remove()
    document.body.append(dialog)
  })
  expect(await apply()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
