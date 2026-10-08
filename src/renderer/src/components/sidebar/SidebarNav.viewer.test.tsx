// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { useStore } from 'zustand'
import type { AppState } from '@/store/types'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createUIStore } from '@/store/slices/ui-slice-test-harness'
import { getDefaultSettings } from '../../../../shared/constants'
import { i18n } from '@/i18n/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applyExtensionsSidebarAction } from '@/runtime/extensions-sidebar-controller'
import SidebarNav from './SidebarNav'

const mocks = vi.hoisted(() => {
  const initial: { store: ReturnType<typeof createUIStore> | null } = { store: null }
  return initial
})
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: AppState) => unknown) => {
    if (!mocks.store) {
      throw new Error('missing store')
    }
    return useStore(mocks.store, selector)
  }
}))
vi.mock('./SetupGuideSidebarEntry', () => ({ SetupGuideSidebarEntry: () => null }))
vi.mock('./SidebarTaskNavButton', () => ({ SidebarTaskNavButton: () => null }))
vi.mock('./mobile-sidebar-onboarding-badge', () => ({
  useMobileSidebarOnboardingBadge: () => ({
    visible: false,
    hasPairedDevice: false,
    dismiss: vi.fn()
  })
}))
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutKeyComboDetails: () => [] }))
let root: Root
let container: HTMLDivElement
let store: ReturnType<typeof createUIStore>
const update = vi.fn()
async function mount() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <TooltipProvider>
        <SidebarNav />
      </TooltipProvider>
    )
  )
}
async function apply(action: Parameters<typeof applyExtensionsSidebarAction>[0]) {
  let promise: ReturnType<typeof applyExtensionsSidebarAction> | undefined
  await act(async () => {
    promise = applyExtensionsSidebarAction(action)
    void promise.catch(() => undefined)
  })
  if (!promise) {
    throw new Error('request missing')
  }
  return promise
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  await i18n.changeLanguage('en')
  store = createUIStore()
  mocks.store = store
  update
    .mockReset()
    .mockImplementation(async (patch) =>
      store.setState({ settings: { ...store.getState().settings, ...patch } })
    )
  store.setState({
    activeOrcaProfileId: 'profile',
    activeModal: 'none',
    activeView: 'terminal',
    settings: {
      ...getDefaultSettings('/fixture'),
      showSkillsButton: true,
      showArtifactsButton: true
    },
    updateSettings: update
  })
})
afterEach(async () => {
  if (root) {
    await act(async () => root.unmount())
  }
  document.body.innerHTML = ''
})
it('opens all three pages through the same native callbacks and records the prior view', async () => {
  await mount()
  for (const [page, label] of [
    ['automations', 'Automations'],
    ['skills', 'Skills'],
    ['artifacts', 'Artifacts']
  ] as const) {
    const before = store.getState().activeView
    const state = await apply({ kind: 'get' })
    const result = await apply({ kind: 'open', page, reviewedTarget: state.reviewedTarget })
    expect(result.activeView).toBe(page)
    expect(store.getState().worktreeNavHistory.at(-1)).toBe(page)
    const button = Array.from(container.querySelectorAll('button')).find(
      (entry) => entry.textContent === label
    )
    expect(button?.getAttribute('aria-current')).toBe('page')
    const previous =
      page === 'automations'
        ? store.getState().previousViewBeforeAutomations
        : page === 'skills'
          ? store.getState().previousViewBeforeSkills
          : store.getState().previousViewBeforeArtifacts
    expect(previous).toBe(before)
    if (!button) {
      throw new Error('missing native button')
    }
    await act(async () => fireEvent.click(button))
    expect(store.getState().activeView).toBe(page)
  }
})
it('persists hide through the native context menu callback and rejects hidden or stale actions', async () => {
  await mount()
  const state = await apply({ kind: 'get' })
  const result = await apply({ kind: 'hide', page: 'skills', reviewedTarget: state.reviewedTarget })
  expect(update).toHaveBeenLastCalledWith({ showSkillsButton: false })
  expect(result.visible.skills).toBe(false)
  expect(container.textContent).not.toContain('Skills')
  await expect(
    apply({ kind: 'open', page: 'artifacts', reviewedTarget: state.reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
  await expect(
    apply({ kind: 'open', page: 'skills', reviewedTarget: result.reviewedTarget })
  ).rejects.toThrow('sidebar_entry_hidden')
  const button = Array.from(container.querySelectorAll('button')).find(
    (entry) => entry.textContent === 'Artifacts'
  )
  if (!button) {
    throw new Error('missing native button')
  }
  await act(async () => fireEvent.contextMenu(button))
  const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((entry) =>
    entry.textContent?.includes('Hide from sidebar')
  )
  if (!item) {
    throw new Error('missing native menu')
  }
  await act(async () => {
    fireEvent.click(item)
  })
  expect(update).toHaveBeenLastCalledWith({ showArtifactsButton: false })
  expect((await apply({ kind: 'get' })).visible.artifacts).toBe(false)
})

it('guards modal, busy and failed saves without reporting a completed hide', async () => {
  await mount()
  await act(async () => store.setState({ activeModal: 'worktree-palette' }))
  const modal = await apply({ kind: 'get' })
  await expect(
    apply({ kind: 'hide', page: 'automations', reviewedTarget: modal.reviewedTarget })
  ).rejects.toThrow('viewer_modal_open')
  expect(update).not.toHaveBeenCalled()
  await act(async () => store.setState({ activeModal: 'none' }))
  let fail: ((error: Error) => void) | undefined
  update.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject
      })
  )
  const state = await apply({ kind: 'get' })
  let request: ReturnType<typeof applyExtensionsSidebarAction> | undefined
  await act(async () => {
    request = applyExtensionsSidebarAction({
      kind: 'hide',
      page: 'automations',
      reviewedTarget: state.reviewedTarget
    })
    void request.catch(() => undefined)
  })
  await expect(
    apply({ kind: 'open', page: 'skills', reviewedTarget: state.reviewedTarget })
  ).rejects.toThrow('viewer_busy')
  expect((await apply({ kind: 'get' })).busy).toBe(true)
  if (!fail) {
    throw new Error('save not started')
  }
  const rejectSave = fail
  await act(async () => rejectSave(new Error('save failed')))
  await expect(request).rejects.toThrow('save failed')
  expect((await apply({ kind: 'get' })).visible.automations).toBe(true)
  expect((await apply({ kind: 'get' })).busy).toBe(false)
})
it('keeps completed persistence separate from an owner change and rejects profile ABA reviews', async () => {
  await mount()
  let finish: (() => void) | undefined
  update.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const state = await apply({ kind: 'get' })
  let request: ReturnType<typeof applyExtensionsSidebarAction> | undefined
  await act(async () => {
    request = applyExtensionsSidebarAction({
      kind: 'hide',
      page: 'automations',
      reviewedTarget: state.reviewedTarget
    })
    void request.catch(() => undefined)
  })
  await act(async () => store.setState({ activeOrcaProfileId: 'other' }))
  await act(async () => store.setState({ activeOrcaProfileId: 'profile' }))
  if (!finish) {
    throw new Error('save not started')
  }
  const completeSave = finish
  await act(async () => completeSave())
  await expect(request).resolves.toMatchObject({
    completed: { kind: 'hide', page: 'automations', reviewStatus: 'changed' }
  })
  await expect(
    apply({ kind: 'open', page: 'automations', reviewedTarget: state.reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
})
it('rejects unavailable and ambiguous mounts and stops pending completion on unmount', async () => {
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
  await mount()
  const second = createRoot(document.createElement('div'))
  await act(async () =>
    second.render(
      <TooltipProvider>
        <SidebarNav />
      </TooltipProvider>
    )
  )
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
  await act(async () => second.unmount())
  let finish: (() => void) | undefined
  update.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const state = await apply({ kind: 'get' })
  let request: ReturnType<typeof applyExtensionsSidebarAction> | undefined
  await act(async () => {
    request = applyExtensionsSidebarAction({
      kind: 'hide',
      page: 'skills',
      reviewedTarget: state.reviewedTarget
    })
    void request.catch(() => undefined)
  })
  await act(async () => root.unmount())
  await expect(request).rejects.toThrow('viewer_unmounted')
  if (!finish) {
    throw new Error('save not started')
  }
  const completeSave = finish
  await act(async () => completeSave())
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})

it.each(['automations', 'skills', 'artifacts'] as const)(
  'hides %s through its exact settings key',
  async (page) => {
    await mount()
    const state = await apply({ kind: 'get' })
    const result = await apply({ kind: 'hide', page, reviewedTarget: state.reviewedTarget })
    const key = {
      automations: 'showAutomationsButton',
      skills: 'showSkillsButton',
      artifacts: 'showArtifactsButton'
    }[page]
    expect(update).toHaveBeenCalledExactlyOnceWith({ [key]: false })
    expect(result.visible[page]).toBe(false)
    expect(result.completed).toEqual({ kind: 'hide', page, reviewStatus: 'current' })
  }
)
