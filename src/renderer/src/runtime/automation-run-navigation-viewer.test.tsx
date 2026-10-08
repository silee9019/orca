// @vitest-environment happy-dom
import { cleanup, render, act } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareAutomationRunsViewerOpen } from './automation-runs-viewer-controller'
import {
  applyAutomationRunNavigation as apply,
  automationRunNavigationSnapshot,
  useAutomationRunNavigationViewer
} from './automation-run-navigation-viewer'

vi.mock('./automation-runs-viewer-controller', () => ({ prepareAutomationRunsViewerOpen: vi.fn() }))
const prepare = vi.mocked(prepareAutomationRunsViewerOpen)
function Harness({ owner = 'pairing:4', view = 'run' }: { owner?: string; view?: string }) {
  useAutomationRunNavigationViewer({
    ownerKeys: new Map([['row', owner]]),
    view,
    origin: 'runs',
    selectedRowKey: 'row',
    selectedRunId: null,
    pendingRunId: 'run',
    detailOpen: true
  })
  return null
}
afterEach(() => {
  cleanup()
  prepare.mockReset()
})

it('rejects owner changes while the original history operation is pending', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const view = render(<Harness view="runs" />)
  prepare.mockReturnValue({ rowKey: 'row', runId: 'run', open: () => view.rerender(<Harness />) })
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply('entry', 'review')
    void pending.catch(() => undefined)
  })
  expect(automationRunNavigationSnapshot()?.busy).toBe(true)
  view.rerender(<Harness owner="pairing:9" />)
  await expect(pending).rejects.toThrow('viewer_target_changed')
  expect(automationRunNavigationSnapshot()?.busy).toBe(false)
})

it('rejects a changed view even if the old navigation remains pending', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const view = render(<Harness view="runs" />)
  prepare.mockReturnValue({ rowKey: 'row', runId: 'run', open: () => view.rerender(<Harness />) })
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply('entry', 'review')
    void pending.catch(() => undefined)
  })
  view.rerender(<Harness view="automations" />)
  await expect(pending).rejects.toThrow('automation_run_navigation_failed')
})
