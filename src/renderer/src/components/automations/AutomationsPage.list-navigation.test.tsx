// @vitest-environment happy-dom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import {
  installAutomationsPageHarness,
  scopedList,
  renderPage,
  mocks,
  api,
  settleHostQueries
} from './automations-page-test-harness'
import { makeAutomation, makeExternalManager } from './automations-page-fixtures'
import { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
import { AutomationViewerActionSchema } from '../../../../shared/automation-viewer-command'
installAutomationsPageHarness()
async function apply(action: unknown) {
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction(AutomationViewerActionSchema.parse(action))
    void request.catch(() => undefined)
  })
  return request
}
it('uses the real list keyboard callbacks to select, scroll and activate the rendered row', async () => {
  mocks.renderRealList = true
  mocks.state.setSelectedAutomationId = (id: string | null) => {
    mocks.state.selectedAutomationId = id
  }
  scopedList([
    makeAutomation({ id: 'a-1', name: 'Alpha' }),
    makeAutomation({ id: 'a-2', name: 'Zulu' })
  ])
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
  const { container } = await renderPage()
  await apply({ kind: 'sort', value: { field: 'name', direction: 'asc' } })
  const state = await applyAutomationViewerAction({ kind: 'get' })
  const [first, second] = state.visibleRowKeys
  expect(first).toBeTruthy()
  expect(second).toBeTruthy()
  await apply({ kind: 'list-navigation', action: 'previous' })
  await expect(apply({ kind: 'list-navigation', action: 'next' })).resolves.toMatchObject({
    selectedRowKey: second,
    detailOpen: false
  })
  expect(
    container.querySelector('[data-current="true"]')?.getAttribute('data-automation-row-id')
  ).toBe(second)
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  await expect(apply({ kind: 'list-navigation', action: 'previous' })).resolves.toMatchObject({
    selectedRowKey: first
  })
  await expect(apply({ kind: 'list-navigation', action: 'previous' })).resolves.toMatchObject({
    selectedRowKey: first
  })
  await expect(apply({ kind: 'list-navigation', action: 'activate' })).resolves.toMatchObject({
    selectedRowKey: first,
    detailOpen: true
  })
  expect(container.querySelector('[data-automation-row-id]')).toBeNull()
  expect(container.querySelector('[data-testid="detail-pane"]')).not.toBeNull()
  await expect(apply({ kind: 'list-navigation', action: 'next' })).rejects.toThrow(
    'viewer_unavailable'
  )
  scroll.mockRestore()
})

it('moves from a local row to the exact external owner row and opens its overview', async () => {
  mocks.renderRealList = true
  mocks.state.setSelectedAutomationId = (id: string | null) => {
    mocks.state.selectedAutomationId = id
  }
  scopedList([makeAutomation({ id: 'a-1', name: 'Alpha' })])
  api.automations.listExternalManagerForOwner.mockImplementation(
    async ({ provider }: { provider: string }) =>
      provider === 'hermes'
        ? { manager: makeExternalManager(), error: null, updatedAt: 1 }
        : { manager: null, error: null, updatedAt: 1 }
  )
  await renderPage()
  await settleHostQueries()
  await apply({ kind: 'sort', value: { field: 'name', direction: 'asc' } })
  await apply({ kind: 'tab', value: 'runs' })
  const state = await applyAutomationViewerAction({ kind: 'get' })
  const externalKey = state.visibleRowKeys[1]
  expect(externalKey).toBeTruthy()
  await expect(apply({ kind: 'list-navigation', action: 'next' })).resolves.toMatchObject({
    selectedExternalKey: externalKey,
    selectedRowKey: null,
    detailOpen: false,
    tab: 'overview'
  })
  await expect(apply({ kind: 'list-navigation', action: 'activate' })).resolves.toMatchObject({
    selectedExternalKey: externalKey,
    detailOpen: true,
    tab: 'overview'
  })
  expect(api.automations.runExternalActionForOwner).not.toHaveBeenCalled()
})
