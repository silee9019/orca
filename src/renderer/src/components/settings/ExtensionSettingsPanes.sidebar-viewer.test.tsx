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
import SidebarNav from '../sidebar/SidebarNav'
import { ArtifactsSettingsPane } from './ArtifactsSettingsPane'
import { AutomationsSettingsPane } from './AutomationsSettingsPane'
import { ShareSkillsSettingsPane } from './ShareSkillsSettingsPane'

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
vi.mock('@/lib/web-client-location', () => ({ isWebClientLocation: () => false }))
vi.mock('../sidebar/SetupGuideSidebarEntry', () => ({ SetupGuideSidebarEntry: () => null }))
vi.mock('../sidebar/SidebarTaskNavButton', () => ({ SidebarTaskNavButton: () => null }))
vi.mock('../sidebar/mobile-sidebar-onboarding-badge', () => ({
  useMobileSidebarOnboardingBadge: () => ({
    visible: false,
    hasPairedDevice: false,
    dismiss: vi.fn()
  })
}))
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutKeyComboDetails: () => [] }))

const PAGES = [
  {
    page: 'automations',
    key: 'showAutomationsButton',
    open: 'Open Automations',
    toggle: 'Show Automations Button'
  },
  { page: 'skills', key: 'showSkillsButton', open: 'Open Skills', toggle: 'Show Skills button' },
  {
    page: 'artifacts',
    key: 'showArtifactsButton',
    open: 'Open Artifacts',
    toggle: 'Show Artifacts Button'
  }
] as const

let root: Root
let container: HTMLDivElement
let store: ReturnType<typeof createUIStore>
const update = vi.fn()

function Panes() {
  const settings = useStore(store, (state) => state.settings)
  if (!settings) {
    return null
  }
  return (
    <TooltipProvider>
      <SidebarNav />
      <AutomationsSettingsPane settings={settings} updateSettings={update} />
      <ArtifactsSettingsPane settings={settings} updateSettings={update} />
      <ShareSkillsSettingsPane />
    </TooltipProvider>
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
function nativeControl(role: 'button' | 'switch', name: string) {
  const match = Array.from(container.querySelectorAll(`[role="${role}"], button`)).find(
    (entry) => entry.textContent?.includes(name) || entry.getAttribute('aria-label') === name
  )
  if (!match) {
    throw new Error(`missing ${name}`)
  }
  return match
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
    orcaProfileAuthStatus: {
      activeProfileId: 'profile',
      configured: true,
      state: 'connected',
      persistence: 'encrypted'
    },
    fetchOrcaProfileAuthStatus: vi.fn(),
    openSkillsSharedLinks: vi.fn(),
    settings: {
      ...getDefaultSettings('/fixture'),
      showAutomationsButton: false,
      showSkillsButton: false,
      showArtifactsButton: false
    },
    updateSettings: update
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<Panes />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.innerHTML = ''
})

it.each(PAGES)(
  'opens $page from the Settings pane button and the CLI with the same store transition even when its sidebar entry is hidden',
  async ({ page, open }) => {
    const before = store.getState().activeView
    const transitions: { activeView: string; nav: unknown; previous: unknown }[] = []
    for (const mode of ['native', 'cli']) {
      await act(async () => store.setState({ activeView: before }))
      if (mode === 'native') {
        await act(async () => fireEvent.click(nativeControl('button', open)))
      } else {
        const state = await apply({ kind: 'get' })
        const result = await apply({
          kind: 'open-page',
          page,
          reviewedTarget: state.reviewedTarget
        })
        expect(result.completed).toEqual({ kind: 'open-page', page, reviewStatus: 'current' })
      }
      const current = store.getState()
      transitions.push({
        activeView: current.activeView,
        nav: current.worktreeNavHistory.at(-1),
        previous: {
          automations: current.previousViewBeforeAutomations,
          skills: current.previousViewBeforeSkills,
          artifacts: current.previousViewBeforeArtifacts
        }
      })
    }
    expect(transitions[0]).toEqual(transitions[1])
    expect(transitions[1]?.activeView).toBe(page)
  }
)

it.each(PAGES)(
  'shows hidden $page entry through the Settings pane switch and the CLI with the same settings payload',
  async ({ page, key, toggle }) => {
    await act(async () => fireEvent.click(nativeControl('switch', toggle)))
    expect(update).toHaveBeenCalledExactlyOnceWith({ [key]: true })
    expect((await apply({ kind: 'get' })).visible[page]).toBe(true)
    const settings = store.getState().settings
    if (!settings) {
      throw new Error('missing settings')
    }
    await act(async () => store.setState({ settings: { ...settings, [key]: false } }))
    update.mockClear()
    const state = await apply({ kind: 'get' })
    const result = await apply({ kind: 'show', page, reviewedTarget: state.reviewedTarget })
    expect(update).toHaveBeenCalledExactlyOnceWith({ [key]: true })
    expect(result.visible[page]).toBe(true)
    expect(result.completed).toEqual({ kind: 'show', page, reviewStatus: 'current' })
    await expect(
      apply({ kind: 'show', page, reviewedTarget: result.reviewedTarget })
    ).rejects.toThrow('sidebar_entry_visible')
  }
)
