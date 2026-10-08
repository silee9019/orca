// @vitest-environment happy-dom
import { TooltipProvider } from '../ui/tooltip'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  runtimeHost,
  RUNTIME_ID,
  RUNTIME_SELF_FILTER,
  settleHostQueries
} from './automations-page-test-harness'
import { selfScopedList } from './automations-page-runtime-fixtures'
import { makeAutomation } from './automations-page-fixtures'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
import type { AutomationHostFilter } from '../../../../shared/automation-host-filter'

installAutomationsPageHarness()
afterEach(cleanup)
let apply: typeof applyAutomationViewerAction
async function mountPage() {
  vi.resetModules()
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  mocks.setAutomationHostFilter.mockImplementation((filter: AutomationHostFilter) => {
    mocks.state.automationHostFilter = filter
  })
  const renderPage = () => (
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  const view = render(renderPage())
  return { view, rerender: () => view.rerender(renderPage()) }
}

it('waits for both list reads and blocks competing viewer mutations', async () => {
  await mountPage()
  await settleHostQueries()
  let finishPage!: (value: ReturnType<typeof makeAutomation>[]) => void
  let finishHosts!: (value: ReturnType<typeof selfScopedList>) => void
  api.automations.list.mockReturnValue(
    new Promise((resolve) => {
      finishPage = resolve
    })
  )
  api.automations.listScoped.mockReturnValue(
    new Promise((resolve) => {
      finishHosts = resolve
    })
  )
  let pending: ReturnType<typeof apply> | undefined
  let settled = false
  await act(async () => {
    pending = apply({ kind: 'refresh' })
    void pending.then(() => {
      settled = true
    })
  })
  expect(settled).toBe(false)
  await expect(apply({ kind: 'host-select', stableKey: null })).rejects.toThrow('viewer_busy')
  await act(async () => {
    finishPage([makeAutomation()])
  })
  expect(settled).toBe(false)
  await act(async () => {
    finishHosts(selfScopedList([makeAutomation()]))
  })
  await expect(pending).resolves.toMatchObject({
    refresh: { page: 'completed', hosts: 'settled' },
    hostLoadCounts: { failedHostCount: 0 }
  })
})

it('uses the actual toolbar and CLI to invoke the same existing list services', async () => {
  mocks.renderRealList = true
  await mountPage()
  await settleHostQueries()
  api.automations.list.mockClear()
  api.automations.listScoped.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh automations' }))
  await waitFor(() => {
    expect(api.automations.list).toHaveBeenCalledTimes(1)
    expect(api.automations.listScoped).toHaveBeenCalledTimes(1)
  })
  await settleHostQueries()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'refresh' })
  })
  await expect(pending).resolves.toMatchObject({ refresh: { page: 'completed', hosts: 'settled' } })
  expect(api.automations.list).toHaveBeenCalledTimes(2)
  expect(api.automations.listScoped).toHaveBeenCalledTimes(2)
  expect(api.automations.create).not.toHaveBeenCalled()
  expect(api.automations.update).not.toHaveBeenCalled()
  expect(api.automations.runNow).not.toHaveBeenCalled()
})

it('reports failed page and host reads without treating scheduler settlement as success', async () => {
  await mountPage()
  await settleHostQueries()
  api.automations.list.mockRejectedValue(new Error('page read unavailable'))
  api.automations.listScoped.mockRejectedValue(new Error('host read unavailable'))
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'refresh' })
  })
  await expect(pending).resolves.toMatchObject({
    refresh: { page: 'failed', hosts: 'settled' },
    hostLoadCounts: { failedHostCount: 1 }
  })
})

it('rejects a runtime catalog owner change after the captured refresh settles', async () => {
  runtimeHost([makeAutomation()], [])
  mocks.state.automationHostFilter = RUNTIME_SELF_FILTER
  const { rerender } = await mountPage()
  await settleHostQueries()
  let finish!: (value: ReturnType<typeof makeAutomation>[]) => void
  api.automations.list.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'refresh' })
    void pending.catch(() => undefined)
  })
  mocks.state.runtimeEnvironments = [
    { id: RUNTIME_ID, name: 'GPU box', createdAt: 1, pairingRevision: 9 }
  ]
  rerender()
  await expect(apply({ kind: 'host-select', stableKey: null })).rejects.toThrow('viewer_busy')
  await act(async () => {
    finish([makeAutomation()])
  })
  await expect(pending).rejects.toThrow('viewer_target_changed')
})

it('rejects unmounted refresh requests and ignores late reads', async () => {
  const { view } = await mountPage()
  await settleHostQueries()
  let finish!: (value: ReturnType<typeof makeAutomation>[]) => void
  api.automations.list.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'refresh' })
    void pending.catch(() => undefined)
  })
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    finish([makeAutomation()])
  })
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
