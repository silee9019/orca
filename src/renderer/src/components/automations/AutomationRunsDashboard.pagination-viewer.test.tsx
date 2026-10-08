// @vitest-environment happy-dom
import { act, useCallback, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import type { AutomationAuthorityRef } from '../../../../shared/automation-owner-ref'
import type { AutomationRunsPage } from '../../../../shared/automations-types'
import { makeAutomationListRow, makeRun } from './automations-page-fixtures'
import { useAutomationRunsDashboard } from './use-automation-runs-dashboard'
import { AutomationRunsDashboardSurface } from './AutomationRunsDashboardSurface'
import * as dispatch from './automation-row-action-dispatch'
import { applyAutomationRunsViewerAction as apply } from '../../runtime/automation-runs-viewer-controller'

vi.mock('./automation-row-action-dispatch', async (importOriginal) => ({
  ...(await importOriginal<typeof dispatch>()),
  dispatchAutomationRunHistoryPage: vi.fn()
}))
const history = vi.mocked(dispatch.dispatchAutomationRunHistoryPage)
const row = makeAutomationListRow()
const rows = [row]
const context = { capturedOwners: new Map(), authority: { kind: 'desktop' as const } }
const pages: Record<string, AutomationRunsPage> = {
  head: {
    runs: [makeRun({ id: 'new-run', createdAt: 2, scheduledFor: 2 })],
    nextCursor: 'cursor-2'
  },
  'cursor-2': {
    runs: [makeRun({ id: 'old-run', createdAt: 1, scheduledFor: 1 })],
    nextCursor: null
  }
}
function Harness({ authority = context.authority }: { authority?: AutomationAuthorityRef }) {
  const [reload, setReload] = useState(0)
  const dashboard = useAutomationRunsDashboard({
    enabled: true,
    rows,
    context,
    legacyTarget: useCallback(() => null, []),
    authorityForRow: useCallback(() => authority, [authority]),
    reloadToken: reload
  })
  return (
    <TooltipProvider>
      <AutomationRunsDashboardSurface
        rows={rows}
        entries={dashboard.entries}
        failures={dashboard.failures}
        loading={dashboard.loading}
        hasMore={dashboard.hasMore}
        request={dashboard.request}
        now={30}
        onLoadMore={dashboard.loadMore}
        onRefresh={() => setReload((value) => value + 1)}
        setPageView={() => undefined}
        setRunPageOrigin={() => undefined}
        selectAutomationRow={() => undefined}
        setPendingAutomationRunNavigation={() => undefined}
        setIsDetailOpen={() => undefined}
      />
    </TooltipProvider>
  )
}
async function reviewed() {
  await waitFor(async () => expect((await apply({ kind: 'get' })).loading).toBe(false))
  return apply({ kind: 'get' })
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  history.mockImplementation(async (_context, _row, options) => ({
    ok: true,
    value: pages[options.cursor ?? 'head']
  }))
})
afterEach(() => {
  cleanup()
  history.mockReset()
})

it('waits for a paginated response and rejects concurrent filter changes', async () => {
  render(<Harness />)
  const before = await reviewed()
  let finish!: (
    value: Awaited<ReturnType<typeof dispatch.dispatchAutomationRunHistoryPage>>
  ) => void
  history.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let pending: ReturnType<typeof apply> | undefined
  let settled = false
  await act(async () => {
    pending = apply({ kind: 'load-more', reviewedTarget: before.reviewedTarget })
    void pending.then(() => {
      settled = true
    })
  })
  expect(settled).toBe(false)
  expect((await apply({ kind: 'get' })).busy).toBe(true)
  await expect(apply({ kind: 'query', value: 'competing' })).rejects.toThrow('viewer_busy')
  expect(history.mock.calls.at(-1)?.[2].cursor).toBe('cursor-2')
  await act(async () => {
    finish({ ok: true, value: pages['cursor-2'] })
  })
  await expect(pending).resolves.toMatchObject({
    hasMore: false,
    busy: false,
    outcome: { action: 'load-more', operation: 'settled' }
  })
  expect((await reviewed()).entries.map((entry) => entry.run.id)).toEqual(['new-run', 'old-run'])
})

it('shares actual infinite scroll and CLI refresh/load-more with the same cursor rules', async () => {
  const view = render(<Harness />)
  await reviewed()
  const scrollContainer = Array.from(view.container.querySelectorAll('div')).find((element) =>
    element.classList.contains('h-[calc(100vh-21rem)]')
  )
  if (!scrollContainer) {
    throw new Error('Missing runs scroll container')
  }
  fireEvent.scroll(scrollContainer)
  await waitFor(async () => expect((await apply({ kind: 'get' })).hasMore).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh runs' }))
  await waitFor(async () => expect((await apply({ kind: 'get' })).hasMore).toBe(true))
  const afterUi = await reviewed()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'refresh', reviewedTarget: afterUi.reviewedTarget })
  })
  await expect(pending).resolves.toMatchObject({
    hasMore: true,
    entries: [{ run: { id: 'new-run' } }],
    outcome: { action: 'refresh' }
  })
  const beforeMore = await reviewed()
  await act(async () => {
    pending = apply({ kind: 'load-more', reviewedTarget: beforeMore.reviewedTarget })
  })
  await expect(pending).resolves.toMatchObject({ hasMore: false })
  expect(history.mock.calls.map((call) => call[2].cursor)).toEqual([
    undefined,
    'cursor-2',
    undefined,
    undefined,
    'cursor-2'
  ])
})

it('keeps failed pagination visibly failed and retains the cursor for retry', async () => {
  render(<Harness />)
  const before = await reviewed()
  history.mockResolvedValueOnce({
    ok: false,
    notice: { message: 'read unavailable', recovery: null, severity: 'failure' }
  })
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'load-more', reviewedTarget: before.reviewedTarget })
  })
  await expect(pending).resolves.toMatchObject({
    hasMore: true,
    visibleFailureCount: 1,
    outcome: { operation: 'settled' }
  })
  const failed = await reviewed()
  await act(async () => {
    pending = apply({ kind: 'load-more', reviewedTarget: failed.reviewedTarget })
  })
  await pending
  expect(history.mock.calls.at(-1)?.[2].cursor).toBe('cursor-2')
})

it('rejects stale reviews and load-more without a remaining cursor', async () => {
  render(<Harness />)
  const before = await reviewed()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'status', value: 'successful' })
  })
  await pending
  await expect(apply({ kind: 'refresh', reviewedTarget: before.reviewedTarget })).rejects.toThrow(
    'viewer_target_changed'
  )
  const current = await reviewed()
  await act(async () => {
    pending = apply({ kind: 'load-more', reviewedTarget: current.reviewedTarget })
  })
  await pending
  const end = await reviewed()
  await expect(apply({ kind: 'load-more', reviewedTarget: end.reviewedTarget })).rejects.toThrow(
    'automation_runs_no_more'
  )
})

it('rejects re-paired owners and discards the old page after the new head commits', async () => {
  const paired = (pairingRevision: number): AutomationAuthorityRef => ({
    kind: 'runtime',
    environmentId: 'gpu',
    pairingRevision
  })
  const view = render(<Harness authority={paired(4)} />)
  const before = await reviewed()
  let finish!: (
    value: Awaited<ReturnType<typeof dispatch.dispatchAutomationRunHistoryPage>>
  ) => void
  history.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'load-more', reviewedTarget: before.reviewedTarget })
    void pending.catch(() => undefined)
  })
  view.rerender(<Harness authority={paired(9)} />)
  await expect(pending).rejects.toThrow('viewer_target_changed')
  await reviewed()
  await act(async () => {
    finish({ ok: true, value: pages['cursor-2'] })
  })
  expect((await reviewed()).entries.map((entry) => entry.run.id)).toEqual(['new-run'])
  expect(history.mock.calls.at(-1)?.[2].cursor).toBeUndefined()
})

it('rejects unmounted requests and ignores late history pages', async () => {
  const view = render(<Harness />)
  const before = await reviewed()
  let finish!: (
    value: Awaited<ReturnType<typeof dispatch.dispatchAutomationRunHistoryPage>>
  ) => void
  history.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'load-more', reviewedTarget: before.reviewedTarget })
    void pending.catch(() => undefined)
  })
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    finish({ ok: true, value: pages['cursor-2'] })
  })
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
