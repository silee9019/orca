// @vitest-environment happy-dom
import { TooltipProvider } from '../ui/tooltip'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  settleHostQueries
} from './automations-page-test-harness'
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

it.each([
  ['dropdown', 'Edit'],
  ['context', 'Edit'],
  ['dropdown', 'Delete'],
  ['context', 'Delete']
] as const)('shares the %s %s target with the existing CLI viewer action', async (menu, label) => {
  mocks.renderRealList = true
  const { view } = await mountPage()
  await settleHostQueries()
  const before = await apply({ kind: 'get' })
  const rowKey = before.visibleRowKeys[0]
  if (!rowKey) {
    throw new Error('missing displayed row')
  }
  if (menu === 'dropdown') {
    fireEvent.keyDown(screen.getByRole('button', { name: 'Automation actions' }), { key: 'Enter' })
  } else {
    const row = document.querySelector('[data-automation-row-id]')
    if (!row) {
      throw new Error('missing actual row element')
    }
    fireEvent.contextMenu(row, { clientX: 20, clientY: 20 })
  }
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
  await waitFor(async () => {
    const state = await apply({ kind: 'get' })
    expect(label === 'Edit' ? state.editor.open : state.deletion?.open).toBe(true)
  })
  const ui = await apply({ kind: 'get' })
  const uiTarget =
    label === 'Edit'
      ? { rowKey: ui.editor.rowKey, definitionId: ui.editor.automationId }
      : { rowKey: ui.deletion?.rowKey, definitionId: ui.deletion?.definitionId }
  expect(uiTarget.rowKey).toBe(rowKey)
  expect(uiTarget.definitionId).toBeTruthy()
  view.unmount()
  await mountPage()
  await settleHostQueries()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(
      label === 'Edit'
        ? { kind: 'editor-edit', source: 'local', rowKey }
        : { kind: 'delete-form', action: { kind: 'request', source: 'local', rowKey } }
    )
  })
  const cli = await pending
  expect(cli).toBeDefined()
  expect(
    label === 'Edit'
      ? { rowKey: cli?.editor.rowKey, definitionId: cli?.editor.automationId }
      : { rowKey: cli?.deletion?.rowKey, definitionId: cli?.deletion?.definitionId }
  ).toEqual(uiTarget)
  expect(api.automations.update).not.toHaveBeenCalled()
  expect(api.automations.delete).not.toHaveBeenCalled()
})

it('shares the context menu Pause callback with the reviewed CLI toggle', async () => {
  mocks.renderRealList = true
  const { view } = await mountPage()
  await settleHostQueries()
  const row = document.querySelector('[data-automation-row-id]')
  if (!row) {
    throw new Error('missing actual row element')
  }
  fireEvent.contextMenu(row, { clientX: 20, clientY: 20 })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Pause' }))
  await waitFor(() => expect(api.automations.update).toHaveBeenCalledTimes(1))
  const uiDispatch = api.automations.update.mock.calls[0]
  expect(uiDispatch?.[0]).toMatchObject({ updates: { enabled: false } })
  await settleHostQueries()
  view.unmount()
  await mountPage()
  await settleHostQueries()
  const reviewed = (await apply({ kind: 'row-form', action: { kind: 'get' } })).rowForm
  if (!reviewed?.rows[0]) {
    throw new Error('missing reviewed row')
  }
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'row-form',
      action: {
        kind: 'toggle',
        reviewedTarget: reviewed.reviewedTarget,
        rowKey: reviewed.rows[0]!.rowKey
      }
    })
  })
  await expect(pending).resolves.toMatchObject({
    rowForm: { outcome: { mutation: 'acknowledged' } }
  })
  expect(api.automations.update).toHaveBeenCalledTimes(2)
  expect(api.automations.update.mock.calls[1]).toEqual(uiDispatch)
  expect(api.automations.delete).not.toHaveBeenCalled()
})
