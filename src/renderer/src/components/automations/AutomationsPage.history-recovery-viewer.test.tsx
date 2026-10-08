// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  api.automations.listRuns.mockRejectedValue(new Error('history temporarily unavailable'))
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  const view = render(
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  await settleHostQueries()
  const rowKey = (await apply({ kind: 'get' })).visibleRowKeys[0]
  if (!rowKey) {
    throw new Error('missing row')
  }
  await request({ kind: 'select', source: 'local', rowKey })
  await request({ kind: 'tab', value: 'runs' })
  await settleHostQueries()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy())
  return view
}
it('reuses the actual history Retry callback and reports the request separately from host completion', async () => {
  const native = await mount()
  api.automations.listRuns.mockResolvedValue([makeRun()])
  api.automations.listRuns.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await settleHostQueries()
  await waitFor(async () => expect((await apply({ kind: 'get' })).history?.unavailable).toBe(false))
  const nativeArgs = api.automations.listRuns.mock.calls[0]
  expect(nativeArgs).toBeDefined()
  native.unmount()
  await mount()
  const before = (await apply({ kind: 'get' })).history
  if (!before) {
    throw new Error('missing history')
  }
  expect(before.recovery).toBe('retry')
  await expect(
    request({ kind: 'history-recover', action: 'reconnect', reviewedTarget: before.reviewedTarget })
  ).rejects.toThrow('automation_history_recovery_unavailable')
  api.automations.listRuns.mockResolvedValue([makeRun()])
  api.automations.listRuns.mockClear()
  const result = await request({
    kind: 'history-recover',
    action: 'retry',
    reviewedTarget: before.reviewedTarget
  })
  expect(result.historyRecovery).toMatchObject({
    busy: false,
    completed: { recoveryRequested: 'retry' }
  })
  await settleHostQueries()
  await waitFor(() => expect(api.automations.listRuns).toHaveBeenCalled())
  expect(api.automations.listRuns.mock.calls[0]).toEqual(nativeArgs)
  await expect(
    request({ kind: 'history-recover', action: 'retry', reviewedTarget: before.reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
  expect(api.automations.runNow).not.toHaveBeenCalled()
  expect(api.automations.delete).not.toHaveBeenCalled()
})

it('forwards actual Page refresh and infinite scroll through the existing runs-form callbacks', async () => {
  const original = mocks.callRuntimeRpc.getMockImplementation()
  if (!original) {
    throw new Error('missing RPC fixture')
  }
  mocks.callRuntimeRpc.mockImplementation(async (target, method, params, options) => {
    if (method !== 'automation.runs') {
      return original(target, method, params, options)
    }
    const cursor =
      typeof params === 'object' && params !== null && 'cursor' in params ? params.cursor : null
    return cursor === 'older'
      ? { runs: [makeRun({ id: 'older-run' })], nextCursor: null }
      : { runs: [makeRun()], nextCursor: 'older' }
  })
  vi.resetModules()
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  const view = render(
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  await settleHostQueries()
  await request({ kind: 'navigate', value: 'runs' })
  await settleHostQueries()
  await waitFor(async () => expect((await apply({ kind: 'get' })).runs?.loading).toBe(false))
  const calls = () =>
    mocks.callRuntimeRpc.mock.calls.filter((call) => call[1] === 'automation.runs')
  const before = calls().length
  fireEvent.click(screen.getByRole('button', { name: 'Refresh runs' }))
  await settleHostQueries()
  await waitFor(() => expect(calls().length).toBeGreaterThan(before))
  const nativeRefresh = calls().at(-1)?.[2]
  const review = (await apply({ kind: 'get' })).runs
  if (!review) {
    throw new Error('missing runs review')
  }
  const cliRefresh = await request({
    kind: 'runs-form',
    action: { kind: 'refresh', reviewedTarget: review.reviewedTarget }
  })
  expect(cliRefresh.runsForm?.outcome?.action).toBe('refresh')
  expect(calls().at(-1)?.[2]).toEqual(nativeRefresh)
  const scroller = Array.from(view.container.querySelectorAll('div')).find((element) =>
    element.classList.contains('h-[calc(100vh-21rem)]')
  )
  if (!scroller) {
    throw new Error('missing actual infinite scroll container')
  }
  fireEvent.scroll(scroller)
  await waitFor(async () => expect((await apply({ kind: 'get' })).runs?.hasMore).toBe(false))
  const nativeMore = calls().at(-1)?.[2]
  const afterNative = (await apply({ kind: 'get' })).runs
  if (!afterNative) {
    throw new Error('missing runs review')
  }
  expect(afterNative.entries.map((entry) => entry.run.id)).toContain('older-run')
  await request({
    kind: 'runs-form',
    action: { kind: 'refresh', reviewedTarget: afterNative.reviewedTarget }
  })
  const next = (await apply({ kind: 'get' })).runs
  if (!next) {
    throw new Error('missing runs review')
  }
  const cliMore = await request({
    kind: 'runs-form',
    action: { kind: 'load-more', reviewedTarget: next.reviewedTarget }
  })
  expect(cliMore.runsForm?.hasMore).toBe(false)
  expect(cliMore.runsForm?.entries.map((entry) => entry.run.id)).toContain('older-run')
  expect(calls().at(-1)?.[2]).toEqual(nativeMore)
})
