// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  settleHostQueries
} from './automations-page-test-harness'
import { makeRun } from './automations-page-fixtures'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
vi.mock('@tanstack/react-virtual', async () => {
  const { createVirtualizerStub } = await import('./virtualizer-test-stub')
  return { useVirtualizer: createVirtualizerStub() }
})
installAutomationsPageHarness()
afterEach(cleanup)
let apply: typeof applyAutomationViewerAction
async function request(action: Parameters<typeof apply>[0]) {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
async function mount() {
  vi.resetModules()
  vi.doUnmock('./AutomationsDetailPane')
  api.automations.listRuns.mockResolvedValue([makeRun(), makeRun({ id: 'second-run' })])
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  const markup = () => (
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  const view = render(markup())
  await settleHostQueries()
  const rowKey = (await apply({ kind: 'get' })).visibleRowKeys[0]
  if (!rowKey) {
    throw new Error('missing row')
  }
  await request({ kind: 'select', source: 'local', rowKey })
  await request({ kind: 'tab', value: 'runs' })
  await settleHostQueries()
  await waitFor(async () =>
    expect((await apply({ kind: 'get' })).history?.runIds).toContain('second-run')
  )
  return { view, rowKey, redraw: () => view.rerender(markup()) }
}
it('opens the same run from actual history click and reviewed public navigation', async () => {
  const native = await mount()
  const row = document.querySelector('[data-automation-run-id="second-run"]')
  if (!row) {
    throw new Error('missing native row')
  }
  fireEvent.click(row)
  await settleHostQueries()
  const before = await apply({ kind: 'get' })
  expect(before.runPage).toMatchObject({
    runId: 'second-run',
    origin: 'automation',
    rowKey: native.rowKey
  })
  native.view.unmount()
  await mount()
  const history = (await apply({ kind: 'get' })).history
  if (!history) {
    throw new Error('missing history')
  }
  const cli = await request({
    kind: 'history-open',
    runId: 'second-run',
    reviewedTarget: history.reviewedTarget
  })
  expect(cli.runPage).toMatchObject({
    runId: 'second-run',
    origin: 'automation',
    rowKey: native.rowKey
  })
  expect(cli.runNavigation).toMatchObject({
    runId: 'second-run',
    origin: 'automation',
    busy: false
  })
  expect(cli.history).toBeNull()
  expect(api.automations.runNow).not.toHaveBeenCalled()
})
it('rejects unloaded runs, profile ABA, modal reviews and closed history', async () => {
  const page = await mount()
  const before = (await apply({ kind: 'get' })).history
  if (!before) {
    throw new Error('missing history')
  }
  await expect(
    request({ kind: 'history-open', runId: 'missing', reviewedTarget: before.reviewedTarget })
  ).rejects.toThrow('automation_run_not_visible')
  const profile = mocks.state.activeOrcaProfileId
  act(() => {
    mocks.state.activeOrcaProfileId = 'other'
    page.redraw()
  })
  act(() => {
    mocks.state.activeOrcaProfileId = profile
    page.redraw()
  })
  await expect(
    request({ kind: 'history-open', runId: 'second-run', reviewedTarget: before.reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
  act(() => {
    mocks.state.activeModal = 'worktree-palette'
    page.redraw()
  })
  const current = (await apply({ kind: 'get' })).history
  if (!current) {
    throw new Error('missing history')
  }
  await expect(
    request({ kind: 'history-open', runId: 'second-run', reviewedTarget: current.reviewedTarget })
  ).rejects.toThrow('viewer_modal_open')
  act(() => {
    mocks.state.activeModal = 'none'
    page.redraw()
  })
  await request({ kind: 'tab', value: 'overview' })
  await expect(
    request({ kind: 'history-open', runId: 'second-run', reviewedTarget: current.reviewedTarget })
  ).rejects.toThrow('viewer_unavailable')
})
