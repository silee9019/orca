// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { useAppStore } from '@/store'
import { applySkillsViewerAction } from '../../runtime/skills-viewer-controller'
import { SkillsViewerActionSchema } from '../../../../shared/skills-viewer-command'
import SkillsPage from './SkillsPage'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

let root: Root | undefined
let container: HTMLDivElement
const initialState = useAppStore.getState()
const emptyScan = { skills: [], sources: [], scannedAt: 1 }
const discover = vi.fn()
function ActivePage() {
  const view = useAppStore((state) => state.activeView)
  return view === 'skills' ? <SkillsPage /> : <div>Previous view: {view}</div>
}
async function apply(action: unknown) {
  let request: ReturnType<typeof applySkillsViewerAction> | undefined
  await act(async () => {
    request = applySkillsViewerAction(SkillsViewerActionSchema.parse(action))
    void request.catch(() => undefined)
  })
  return request
}
beforeEach(async () => {
  discover.mockReset().mockResolvedValue(emptyScan)
  useAppStore.setState({
    activeView: 'skills',
    previousViewBeforeSkills: 'terminal',
    runtimeEnvironmentCatalogSettled: true,
    runtimeEnvironments: [],
    settings: null
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: { discover, deleteSupported: async () => true, onInstallProgress: () => () => {} },
      runtimeEnvironments: { call: vi.fn() },
      agents: { detectAgents: async () => [] }
    }
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <ConfirmationDialogProvider>
          <ActivePage />
        </ConfirmationDialogProvider>
      </TooltipProvider>
    )
  })
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container.remove()
  useAppStore.setState(initialState)
  Reflect.deleteProperty(window, 'api')
})
it('acknowledges close only after the actual page leaves the previous view', async () => {
  expect(container.querySelector('main')).not.toBeNull()
  const result = await apply({ kind: 'close' })
  expect(result).toMatchObject({ viewer: 'desktop', committed: true, closed: true })
  expect(useAppStore.getState().activeView).toBe('terminal')
  expect(container.querySelector('main')).toBeNull()
  expect(container.textContent).toContain('Previous view: terminal')
  await expect(applySkillsViewerAction({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
it('keeps the page mounted while an install dialog or refresh is pending', async () => {
  await apply({ kind: 'install', open: true })
  await expect(apply({ kind: 'close' })).rejects.toThrow('viewer_modal_open')
  expect(container.querySelector('main')).not.toBeNull()
  await apply({ kind: 'install', open: false })
  let finish: ((value: typeof emptyScan) => void) | undefined
  discover.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let refreshing: ReturnType<typeof applySkillsViewerAction> | undefined
  await act(async () => {
    refreshing = applySkillsViewerAction({ kind: 'refresh' })
  })
  await expect(apply({ kind: 'close' })).rejects.toThrow('viewer_busy')
  expect(useAppStore.getState().activeView).toBe('skills')
  await act(async () => finish?.(emptyScan))
  await refreshing
  await expect(apply({ kind: 'close' })).resolves.toMatchObject({ closed: true })
})

it('does not acknowledge a close callback before the mounted page is removed', async () => {
  const close = vi.fn()
  await act(async () => useAppStore.setState({ closeSkillsPage: close }))
  let settled = false
  let request: ReturnType<typeof applySkillsViewerAction> | undefined
  await act(async () => {
    request = applySkillsViewerAction(SkillsViewerActionSchema.parse({ kind: 'close' }))
    void request.then(() => {
      settled = true
    })
  })
  expect(close).toHaveBeenCalledOnce()
  expect(settled).toBe(false)
  expect(container.querySelector('main')).not.toBeNull()
  await expect(apply({ kind: 'filter-clear' })).rejects.toThrow('viewer_busy')
  await act(async () => root?.unmount())
  root = undefined
  await expect(request).resolves.toMatchObject({ closed: true })
})
