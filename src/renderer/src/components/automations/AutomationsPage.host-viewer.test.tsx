// @vitest-environment happy-dom
import { TooltipProvider } from '../ui/tooltip'
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  runtimeHost,
  RUNTIME_SELF_FILTER,
  settleHostQueries
} from './automations-page-test-harness'
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

it('selects a loaded runtime host and shares the real host pill clear callback', async () => {
  runtimeHost([makeAutomation()], [])
  mocks.renderRealList = true
  const { rerender } = await mountPage()
  await settleHostQueries()
  const before = await apply({ kind: 'get' })
  const host = before.hosts.find((entry) => entry.label === 'GPU box')
  if (!host) {
    throw new Error('missing runtime host')
  }
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'host-select', stableKey: host.stableKey })
  })
  await expect(pending).resolves.toMatchObject({ hostSelection: { stableKey: host.stableKey } })
  expect(mocks.setAutomationHostFilter).toHaveBeenLastCalledWith(RUNTIME_SELF_FILTER)
  expect(screen.getByRole('button', { name: 'Remove Host filter' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Host filter' }))
  rerender()
  await settleHostQueries()
  expect(mocks.setAutomationHostFilter).toHaveBeenLastCalledWith({ kind: 'all' })
  expect((await apply({ kind: 'get' })).hostSelection.stableKey).toBeNull()
  expect(screen.queryByRole('button', { name: 'Remove Host filter' })).toBeNull()
  await act(async () => {
    pending = apply({ kind: 'host-select', stableKey: null })
  })
  await expect(pending).resolves.toMatchObject({ hostSelection: { stableKey: null } })
  expect(api.automations.create).not.toHaveBeenCalled()
  expect(api.automations.update).not.toHaveBeenCalled()
  expect(api.automations.runNow).not.toHaveBeenCalled()
})

it('rejects unloaded hosts and modal conflicts without changing the selection', async () => {
  await mountPage()
  await settleHostQueries()
  await expect(apply({ kind: 'host-select', stableKey: 'not-loaded' })).rejects.toThrow(
    'automation_host_not_loaded'
  )
  expect(mocks.setAutomationHostFilter).not.toHaveBeenCalled()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'editor-create' })
  })
  await pending
  await expect(apply({ kind: 'host-select', stableKey: null })).rejects.toThrow('viewer_modal_open')
  expect(mocks.setAutomationHostFilter).not.toHaveBeenCalled()
})
