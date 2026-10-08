// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import { ExternalAutomationRunTable } from './ExternalAutomationRunTable'
import { makeExternalManager, makeExternalAutomationScope } from './automations-page-fixtures'
import type { ExternalAutomationRun } from '../../../../shared/automations-types'
import { act } from 'react'
import { useAppStore } from '@/store'
import {
  applyExternalAutomationRunTableViewer as apply,
  externalAutomationRunTablesSnapshot as snapshot
} from '../../runtime/external-automation-run-table-viewer'
beforeEach(() => useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'profile' }))
afterEach(cleanup)
function current() {
  const state = snapshot()[0]
  if (!state) {
    throw new Error('missing table')
  }
  return state
}
async function request(action: Parameters<typeof apply>[1]) {
  let promise: ReturnType<typeof apply> | undefined
  await act(async () => {
    promise = apply(current().tableKey, action)
    void promise.catch(() => undefined)
  })
  if (!promise) {
    throw new Error('missing request')
  }
  return promise
}

function run(index: number): ExternalAutomationRun {
  return {
    id: `run-${index}`,
    managerId: 'hermes:local',
    provider: 'hermes',
    jobId: 'job-1',
    runAt: '2026-10-08T10:00:00.000Z',
    status: 'completed',
    outputPreview: `Run ${index} preview`,
    outputContent: null,
    error: null,
    outputPath: null
  }
}
function fixture() {
  const manager = makeExternalManager()
  const first = manager.jobs[0]
  if (!first) {
    throw new Error('missing job')
  }
  const job = {
    ...first,
    runs: Array.from({ length: 16 }, (_value, index) => run(index)),
    runCount: 16
  }
  return { manager, job, scope: makeExternalAutomationScope(), now: 0 }
}
it('blocks native row selection while scoped run history is still loading', () => {
  const props = fixture()
  const open = vi.fn()
  const fetch = vi.fn(() => new Promise<ExternalAutomationRun[]>(() => undefined))
  render(
    <TooltipProvider>
      <ExternalAutomationRunTable {...props} onFetchRuns={fetch} onOpenRun={open} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: /Run 0 preview/ }))
  expect(open).not.toHaveBeenCalled()
})

it('uses the same visible page and row callbacks for native and reviewed actions', async () => {
  const open = vi.fn()
  render(
    <TooltipProvider>
      <ExternalAutomationRunTable {...fixture()} onOpenRun={open} />
    </TooltipProvider>
  )
  const initial = current()
  await expect(
    request({ kind: 'page', direction: 'previous', reviewedTarget: initial.reviewedTarget })
  ).rejects.toThrow('automation_run_page_unavailable')
  await expect(
    request({ kind: 'select', runId: 'run-8', reviewedTarget: initial.reviewedTarget })
  ).rejects.toThrow('automation_run_not_visible')
  fireEvent.click(screen.getByRole('button', { name: 'Next run page' }))
  expect(current().visibleRunIds).toEqual(Array.from({ length: 8 }, (_, i) => `run-${i + 8}`))
  fireEvent.click(screen.getByRole('button', { name: /Run 9 preview/ }))
  expect(open).toHaveBeenLastCalledWith(run(9))
  await expect(
    request({ kind: 'select', runId: 'run-10', reviewedTarget: initial.reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
  const selected = await request({
    kind: 'select',
    runId: 'run-10',
    reviewedTarget: current().reviewedTarget
  })
  expect(selected).toMatchObject({
    selectedRunId: 'run-10',
    completed: { kind: 'select', openRequested: true }
  })
  expect(open).toHaveBeenLastCalledWith(run(10))
  expect(screen.getByRole('button', { name: /Run 10 preview/ }).getAttribute('data-current')).toBe(
    'true'
  )
  const previous = await request({
    kind: 'page',
    direction: 'previous',
    reviewedTarget: current().reviewedTarget
  })
  expect(previous).toMatchObject({ page: 0, selectedRunId: 'run-0', completed: { kind: 'page' } })
  expect(screen.getByRole('button', { name: /Run 0 preview/ })).toBeTruthy()
})
it('waits for the captured scoped page read and reports read failures', async () => {
  const props = fixture()
  let finish: ((value: { runs: ExternalAutomationRun[]; totalCount: number }) => void) | undefined
  const fetch = vi.fn(async (input: { page: number }) => {
    if (input.page === 0) {
      return { runs: props.job.runs.slice(0, 8), totalCount: 16 }
    }
    return new Promise<{ runs: ExternalAutomationRun[]; totalCount: number }>((resolve) => {
      finish = resolve
    })
  })
  render(
    <TooltipProvider>
      <ExternalAutomationRunTable {...props} onFetchRuns={fetch} />
    </TooltipProvider>
  )
  await waitFor(() => expect(current().loading).toBe(false))
  let completed = false
  const pending = request({
    kind: 'page',
    direction: 'next',
    reviewedTarget: current().reviewedTarget
  }).then((state) => {
    completed = true
    return state
  })
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(fetch).toHaveBeenLastCalledWith({
    scope: props.scope,
    manager: props.manager,
    job: props.job,
    page: 1,
    pageSize: 8
  })
  expect(current()).toMatchObject({ busy: true, loading: true })
  expect(completed).toBe(false)
  await expect(
    request({ kind: 'select', runId: 'run-8', reviewedTarget: current().reviewedTarget })
  ).rejects.toThrow('viewer_busy')
  await act(async () => {
    finish?.({ runs: [run(12)], totalCount: 16 })
  })
  expect(await pending).toMatchObject({
    page: 1,
    readStatus: 'loaded',
    visibleRunIds: ['run-12'],
    busy: false
  })
  fetch.mockRejectedValueOnce(new Error('host disconnected'))
  expect(
    await request({ kind: 'page', direction: 'previous', reviewedTarget: current().reviewedTarget })
  ).toMatchObject({ page: 0, readStatus: 'failed', loading: false })
})
it('invalidates reviews after profile ABA, blocks modals, and rejects unmounted tables', async () => {
  const view = render(
    <TooltipProvider>
      <ExternalAutomationRunTable {...fixture()} />
    </TooltipProvider>
  )
  const before = current()
  act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
  act(() => useAppStore.setState({ activeOrcaProfileId: 'profile' }))
  await expect(
    request({ kind: 'select', runId: 'run-0', reviewedTarget: before.reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
  act(() => useAppStore.setState({ activeModal: 'worktree-palette' }))
  await expect(
    request({ kind: 'select', runId: 'run-0', reviewedTarget: current().reviewedTarget })
  ).rejects.toThrow('viewer_modal_open')
  view.unmount()
  await expect(apply(before.tableKey, { kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
it('rejects ambiguous tables and owner changes during a pending page read', async () => {
  const props = fixture()
  const markup = (
    <TooltipProvider>
      <ExternalAutomationRunTable {...props} />
    </TooltipProvider>
  )
  const first = render(markup)
  const second = render(markup)
  await expect(apply(current().tableKey, { kind: 'get' })).rejects.toThrow('viewer_ambiguous')
  second.unmount()
  first.unmount()
  const fetch = vi.fn(async ({ page }: { page: number }) =>
    page === 0
      ? { runs: [run(0)], totalCount: 16 }
      : new Promise<ExternalAutomationRun[]>(() => undefined)
  )
  render(
    <TooltipProvider>
      <ExternalAutomationRunTable {...props} onFetchRuns={fetch} />
    </TooltipProvider>
  )
  await waitFor(() => expect(current().loading).toBe(false))
  const pending = request({
    kind: 'page',
    direction: 'next',
    reviewedTarget: current().reviewedTarget
  })
  void pending.catch(() => undefined)
  await waitFor(() => expect(current().busy).toBe(true))
  act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
  await expect(pending).rejects.toThrow('viewer_target_changed')
})
it('rejects a pending page on unmount and ignores late reads from a replaced scope', async () => {
  const props = fixture()
  const reads: ((runs: ExternalAutomationRun[]) => void)[] = []
  const fetch = vi.fn(() => new Promise<ExternalAutomationRun[]>((resolve) => reads.push(resolve)))
  const markup = (scope = props.scope) => (
    <TooltipProvider>
      <ExternalAutomationRunTable {...props} scope={scope} onFetchRuns={fetch} />
    </TooltipProvider>
  )
  const view = render(markup())
  await act(async () => {
    reads[0]?.([run(0)])
  })
  const review = current()
  const pending = request({
    kind: 'page',
    direction: 'next',
    reviewedTarget: review.reviewedTarget
  })
  void pending.catch(() => undefined)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    reads[1]?.([run(15)])
  })
  expect(snapshot()).toEqual([])
  const next = render(markup())
  const changed = makeExternalAutomationScope({
    owner: {
      authority: { kind: 'desktop' },
      selector: { kind: 'ssh', targetId: 'other', targetGeneration: 1 }
    }
  })
  next.rerender(markup(changed))
  await act(async () => {
    reads[2]?.([run(3)])
  })
  expect(current().loading).toBe(true)
  await act(async () => {
    reads[3]?.([run(4)])
  })
  expect(current()).toMatchObject({ loading: false, visibleRunIds: ['run-4'] })
  expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ scope: changed }))
})
