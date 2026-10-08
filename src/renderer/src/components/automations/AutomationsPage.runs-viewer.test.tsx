// @vitest-environment happy-dom
import { TooltipProvider } from '../ui/tooltip'
import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  settleHostQueries
} from './automations-page-test-harness'
import { makeRun } from './automations-page-fixtures'
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

it('exposes only the mounted runs dashboard through the public Page viewer', async () => {
  api.automations.listRuns.mockResolvedValue([
    makeRun({ id: 'displayed-run', title: 'Visible history' })
  ])
  await mountPage()
  await settleHostQueries()
  await expect(apply({ kind: 'runs-form', action: { kind: 'get' } })).rejects.toThrow(
    'viewer_unavailable'
  )
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'view', value: 'runs' })
  })
  await pending
  await settleHostQueries()
  const before = (await apply({ kind: 'runs-form', action: { kind: 'get' } })).runsForm
  expect(before?.entries.map((entry) => entry.run.id)).toEqual(['displayed-run'])
  await act(async () => {
    pending = apply({ kind: 'runs-form', action: { kind: 'query', value: 'not-present' } })
  })
  await expect(pending).resolves.toMatchObject({
    runsForm: { query: 'not-present', querySettled: true, entries: [] }
  })
  await act(async () => {
    pending = apply({ kind: 'navigate', value: 'list' })
  })
  await pending
  await expect(apply({ kind: 'runs-form', action: { kind: 'get' } })).rejects.toThrow(
    'viewer_unavailable'
  )
  expect((await apply({ kind: 'get' })).runs).toBeNull()
})
