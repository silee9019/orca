// @vitest-environment happy-dom
import { act } from 'react'
import { expect, it } from 'vitest'
import {
  api,
  settleHostQueries,
  installAutomationsPageHarness,
  renderPage,
  scopedList,
  rows,
  mocks
} from './automations-page-test-harness'
import { makeAutomation, makeExternalManager } from './automations-page-fixtures'
import { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'

installAutomationsPageHarness()

it('acknowledges deferred search and automatic selection using host-qualified row keys', async () => {
  scopedList([
    makeAutomation({ id: 'a-1', name: 'Nightly' }),
    makeAutomation({ id: 'a-2', name: 'Weekly' })
  ])
  mocks.state.setSelectedAutomationId = (id: string | null) => {
    mocks.state.selectedAutomationId = id
  }
  const { container } = await renderPage()
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'query', value: 'Weekly' })
  })
  const result = await request
  expect(rows(container, 'automation-row')).toEqual(['Weekly'])
  expect(result).toMatchObject({ query: 'Weekly', committed: true, searchSettled: true })
  expect(result?.selectedRowKey).toBe(mocks.listPanel?.sortedListItems[0]?.id)
  await expect(
    applyAutomationViewerAction({ kind: 'select', source: 'local', rowKey: 'a-2' })
  ).rejects.toThrow('automation_row_not_visible')
})

it('changes filters and sort through the current page and rejects unknown hosts', async () => {
  scopedList([
    makeAutomation({ id: 'a-1', name: 'Zulu', enabled: true }),
    makeAutomation({ id: 'a-2', name: 'Alpha', enabled: false })
  ])
  mocks.state.setSelectedAutomationId = (id: string | null) => {
    mocks.state.selectedAutomationId = id
  }
  const { container } = await renderPage()
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction({
      kind: 'filter',
      value: { status: 'paused', lastRun: 'all', agentIds: [] }
    })
  })
  await expect(request).resolves.toMatchObject({ filter: { status: 'paused' } })
  expect(rows(container, 'automation-row')).toEqual(['Alpha'])
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'filter-clear' })
  })
  await request
  await act(async () => {
    request = applyAutomationViewerAction({
      kind: 'sort',
      value: { field: 'name', direction: 'asc' }
    })
  })
  await expect(request).resolves.toMatchObject({ sort: { field: 'name', direction: 'asc' } })
  expect(rows(container, 'automation-row')).toEqual(['Alpha', 'Zulu'])
  await expect(
    applyAutomationViewerAction({
      kind: 'filter',
      value: { status: 'all', lastRun: 'all', agentIds: [], hostStableKeys: ['missing-host'] }
    })
  ).rejects.toThrow('automation_host_not_loaded')
})

it('selects the exact row, changes the detail tab and returns to the list under StrictMode', async () => {
  await expect(applyAutomationViewerAction({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
  mocks.state.setSelectedAutomationId = (id: string | null) => {
    mocks.state.selectedAutomationId = id
  }
  const { container } = await renderPage({ strict: true })
  const state = await applyAutomationViewerAction({ kind: 'get' })
  const rowKey = state.visibleRowKeys[0]
  if (!rowKey) {
    throw new Error('missing fixture row')
  }
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'select', source: 'local', rowKey })
  })
  await expect(request).resolves.toMatchObject({ selectedRowKey: rowKey, detailOpen: true })
  expect(container.querySelector('[data-testid="detail-pane"]')).not.toBeNull()
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'tab', value: 'runs' })
  })
  await expect(request).resolves.toMatchObject({ tab: 'runs' })
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'detail', open: false })
  })
  await expect(request).resolves.toMatchObject({ detailOpen: false })
  expect(container.querySelector('[data-testid="list-panel"]')).not.toBeNull()
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'view', value: 'runs' })
  })
  await expect(request).resolves.toMatchObject({ view: 'runs' })
  expect(container.querySelector('[data-testid="list-panel"]')).toBeNull()
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'view', value: 'automations' })
  })
  await expect(request).resolves.toMatchObject({ view: 'automations' })
  expect(container.querySelector('[data-testid="list-panel"]')).not.toBeNull()
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'navigate', value: 'detail-runs' })
  })
  await expect(request).resolves.toMatchObject({
    view: 'automations',
    tab: 'runs',
    detailOpen: true
  })
  expect(container.querySelector('[data-testid="detail-pane"]')).not.toBeNull()
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'navigate', value: 'list' })
  })
  await expect(request).resolves.toMatchObject({
    view: 'automations',
    tab: 'overview',
    detailOpen: false
  })
  expect(container.querySelector('[data-testid="list-panel"]')).not.toBeNull()
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'navigate', value: 'runs' })
  })
  await expect(request).resolves.toMatchObject({ view: 'runs', tab: 'overview', detailOpen: false })
})

it('selects an external owner-qualified row and resets its tab without executing the job', async () => {
  api.automations.listExternalManagerForOwner.mockImplementation(
    async ({ provider }: { provider: string }) =>
      provider === 'hermes'
        ? { manager: makeExternalManager(), error: null, updatedAt: 1 }
        : { manager: null, error: null, updatedAt: 1 }
  )
  await renderPage()
  await settleHostQueries()
  const rowKey = mocks.listPanel?.sortedListItems.find((item) => item.kind === 'external')?.id
  if (!rowKey) {
    throw new Error('missing external fixture row')
  }
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'tab', value: 'runs' })
  })
  await request
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'select', source: 'external', rowKey })
  })
  await expect(request).resolves.toMatchObject({
    selectedExternalKey: rowKey,
    selectedRowKey: null,
    detailOpen: true,
    tab: 'overview'
  })
  expect(api.automations.runNow).not.toHaveBeenCalled()
  expect(api.automations.update).not.toHaveBeenCalled()
})
