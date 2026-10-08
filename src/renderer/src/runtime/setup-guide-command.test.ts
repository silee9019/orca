// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applySetupGuideRequest } from './setup-guide-command'
import { publishSettingsViewerView } from './settings-viewer-view'

const fixture = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  const modalData: Record<string, unknown> = {}
  return {
    listeners: new Set<() => void>(),
    ready: true,
    state: {
      persistedUIReady: true,
      settings,
      activeModal: 'none',
      modalData,
      openModal: vi.fn()
    }
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
const notify = () => fixture.listeners.forEach((callback) => callback())
const request = () => ({
  id: 'r',
  expiresAt: Date.now() + 9000,
  command: { viewer: 'host' as const, operation: 'open' as const }
})
const apply = () => applySetupGuideRequest(request(), () => fixture.ready)
function renderGuide(): HTMLElement {
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.dataset.setupGuideDialog = 'true'
  dialog.dataset.setupGuideSource = 'help_menu'
  dialog.dataset.setupGuideOpen = 'true'
  dialog.dataset.setupGuideStep = 'default-agent'
  dialog.innerHTML =
    '<button aria-current="step" data-setup-guide-step-id="default-agent">Choose agent</button><section data-setup-guide-content-step="default-agent"><h3>Choose agent</h3><p data-setup-guide-description="true">Choose the agent used for new workspaces.</p><div data-setup-guide-action="true"><button>Agent</button></div></section>'
  document.body.append(dialog)
  return dialog
}
beforeEach(() => {
  vi.useFakeTimers()
  fixture.ready = true
  fixture.state.settings.activeRuntimeEnvironmentId = null
  fixture.state.persistedUIReady = true
  fixture.state.activeModal = 'none'
  fixture.state.modalData = {}
  fixture.state.openModal.mockImplementation((modal: string, data: Record<string, unknown>) => {
    fixture.state.activeModal = modal
    fixture.state.modalData = data
    notify()
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 100)
  )
  publishSettingsViewerView(null)
})
afterEach(() => {
  document.body.replaceChildren()
  fixture.listeners.clear()
  publishSettingsViewerView(null)
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.useRealTimers()
})
it('waits for actual dialog and content before acknowledging the original action', async () => {
  let done = false
  const result = apply().then((value) => {
    done = true
    return value
  })
  await vi.advanceTimersByTimeAsync(50)
  expect(done).toBe(false)
  const dialog = renderGuide()
  dialog.querySelector('[data-setup-guide-description]')?.replaceChildren()
  await vi.advanceTimersByTimeAsync(50)
  expect(done).toBe(false)
  const description = dialog.querySelector('[data-setup-guide-description]')
  if (description) {
    description.textContent = 'Choose the agent used for new workspaces.'
  }
  await vi.advanceTimersByTimeAsync(25)
  expect(await result).toMatchObject({
    viewer: 'host',
    applied: true,
    source: 'help_menu',
    stepId: 'default-agent',
    dialogPresent: true,
    contentPresent: true
  })
  expect(fixture.state.openModal).toHaveBeenCalledExactlyOnceWith('setup-guide', {
    telemetrySource: 'help_menu'
  })
  expect(fixture.listeners.size).toBe(0)
})
it.each(['modal', 'dialog', 'alertdialog', 'menu', 'listbox', 'draft'])(
  'protects an existing %s before the original action',
  async (kind) => {
    if (kind === 'modal') {
      fixture.state.activeModal = 'edit-meta'
    } else if (kind === 'draft') {
      publishSettingsViewerView({
        runtimeContextKey: 'local#0',
        activeSectionId: 'general',
        queryInput: '',
        queryApplied: '',
        visibleSectionIds: [],
        renderedSectionIds: [],
        renderedTargetIds: [],
        navigationPending: false,
        hasUnsavedChanges: true
      })
    } else {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', kind)
      if (kind === 'listbox') {
        dialog.dataset.state = 'open'
      }
      document.body.append(dialog)
    }
    await expect(apply()).rejects.toThrow()
    expect(fixture.state.openModal).not.toHaveBeenCalled()
  }
)
it.each(['expired', 'not-ready', 'remote', 'root-unavailable'])(
  'refuses %s without dispatch',
  async (kind) => {
    const value = request()
    if (kind === 'expired') {
      value.expiresAt = Date.now()
    }
    if (kind === 'not-ready') {
      fixture.state.persistedUIReady = false
    }
    if (kind === 'remote') {
      fixture.state.settings.activeRuntimeEnvironmentId = 'remote'
    }
    if (kind === 'root-unavailable') {
      fixture.ready = false
    }
    await expect(applySetupGuideRequest(value, () => fixture.ready)).rejects.toThrow()
    expect(fixture.state.openModal).not.toHaveBeenCalled()
  }
)
it('does not turn missing lazy content into success', async () => {
  const result = apply()
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({
    applied: false,
    dialogPresent: false,
    contentPresent: false,
    reason: 'setup_guide_not_rendered'
  })
})
it.each(['modal', 'runtime'])('keeps %s supersession sticky across return', async (kind) => {
  const result = apply()
  if (kind === 'modal') {
    fixture.state.modalData = {}
    notify()
  }
  if (kind === 'runtime') {
    fixture.state.settings.activeRuntimeEnvironmentId = 'other'
    notify()
    fixture.state.settings.activeRuntimeEnvironmentId = null
    notify()
  }
  renderGuide()
  await vi.advanceTimersByTimeAsync(25)
  expect(await result).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('rejects hidden, duplicate and unrelated dialog content', async () => {
  const result = apply()
  const dialog = renderGuide()
  dialog.hidden = true
  await vi.advanceTimersByTimeAsync(25)
  dialog.hidden = false
  const duplicate = renderGuide()
  await vi.advanceTimersByTimeAsync(25)
  duplicate.remove()
  dialog.dataset.setupGuideSource = 'onboarding'
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: false })
})

it('refuses content arriving after the local deadline', async () => {
  const result = apply()
  setTimeout(renderGuide, 5000)
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: false })
})
it('refuses content outside the viewport', async () => {
  const result = apply()
  renderGuide()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(2000, 2000, 100, 100)
  )
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: false, contentPresent: false })
})
it('keeps acquired dialog removal sticky through reinsertion', async () => {
  const result = apply()
  const dialog = renderGuide()
  const heading = dialog.querySelector('h3')
  if (!heading) {
    throw new Error('fixture heading missing')
  }
  heading.textContent = ''
  await vi.advanceTimersByTimeAsync(25)
  dialog.remove()
  document.body.append(dialog)
  heading.textContent = 'Workbench'
  await vi.advanceTimersByTimeAsync(25)
  expect(await result).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('stops when the root becomes unavailable', async () => {
  const result = apply()
  fixture.ready = false
  await vi.advanceTimersByTimeAsync(25)
  fixture.ready = true
  renderGuide()
  expect(await result).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})

it('allows the persistent inline workspace listbox', async () => {
  const inline = document.createElement('div')
  inline.setAttribute('role', 'listbox')
  inline.dataset.worktreeSidebar = 'true'
  document.body.append(inline)
  const result = apply()
  renderGuide()
  await vi.advanceTimersByTimeAsync(25)
  expect(await result).toMatchObject({ applied: true })
})

it('rejects closed linger even when its checklist remains visible', async () => {
  const result = apply()
  const dialog = renderGuide()
  dialog.dataset.setupGuideOpen = 'false'
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: false, contentPresent: false })
})
it.each(['selection', 'content', 'action'])(
  'requires current step %s to match the dialog',
  async (kind) => {
    const result = apply()
    const dialog = renderGuide()
    if (kind === 'selection') {
      dialog.querySelector('button')?.setAttribute('data-setup-guide-step-id', 'browser')
    } else if (kind === 'content') {
      dialog.querySelector('section')?.setAttribute('data-setup-guide-content-step', 'browser')
    } else {
      dialog.querySelector('[data-setup-guide-action]')?.replaceChildren()
    }
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toMatchObject({ applied: false, contentPresent: false })
  }
)

it('accepts the original completed workspaces step with its omitted action', async () => {
  const result = apply()
  const dialog = renderGuide()
  dialog.dataset.setupGuideStep = 'two-worktrees'
  dialog.querySelector('button')?.setAttribute('data-setup-guide-step-id', 'two-worktrees')
  dialog.querySelector('section')?.setAttribute('data-setup-guide-content-step', 'two-worktrees')
  dialog.querySelector('[data-setup-guide-action]')?.replaceChildren()
  const badge = document.createElement('span')
  badge.dataset.setupGuideCompleted = 'true'
  badge.textContent = 'Done'
  dialog.querySelector('section')?.append(badge)
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: true, stepId: 'two-worktrees' })
})

it.each(['missing-badge', 'empty-badge', 'different-step'])(
  'rejects an omitted action with %s',
  async (kind) => {
    const result = apply()
    const dialog = renderGuide()
    if (kind !== 'different-step') {
      dialog.dataset.setupGuideStep = 'two-worktrees'
      dialog.querySelector('button')?.setAttribute('data-setup-guide-step-id', 'two-worktrees')
      dialog
        .querySelector('section')
        ?.setAttribute('data-setup-guide-content-step', 'two-worktrees')
    }
    dialog.querySelector('[data-setup-guide-action]')?.replaceChildren()
    if (kind !== 'missing-badge') {
      const badge = document.createElement('span')
      badge.dataset.setupGuideCompleted = 'true'
      badge.textContent = kind === 'empty-badge' ? '' : 'Done'
      dialog.querySelector('section')?.append(badge)
    }
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toMatchObject({ applied: false })
  }
)
