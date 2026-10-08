// @vitest-environment happy-dom
import { act } from 'react'
import { expect, it } from 'vitest'
import {
  api,
  installAutomationsPageHarness,
  mocks,
  renderPage,
  settleHostQueries
} from './automations-page-test-harness'
import { makeExternalManager } from './automations-page-fixtures'
import { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
import { AutomationViewerActionSchema } from '../../../../shared/automation-viewer-command'

installAutomationsPageHarness()

it('opens the existing create editor and acknowledges its rendered open state', async () => {
  const { container } = await renderPage()
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction(
      AutomationViewerActionSchema.parse({ kind: 'editor-create' })
    )
  })
  await expect(request).resolves.toMatchObject({
    editor: { open: true, target: 'orca', automationId: null }
  })
  expect(mocks.editorDialog?.open).toBe(true)
  expect(container.querySelector('[data-testid="editor-dialog"]')?.textContent).toBe('open')
  expect(api.automations.create).not.toHaveBeenCalled()
  await expect(applyAutomationViewerAction({ kind: 'filter-clear' })).rejects.toThrow(
    'viewer_modal_open'
  )
})

it('requires the visible owner-qualified row before opening the existing local editor', async () => {
  await renderPage()
  await expect(
    applyAutomationViewerAction(
      AutomationViewerActionSchema.parse({ kind: 'editor-edit', source: 'local', rowKey: 'a-1' })
    )
  ).rejects.toThrow('automation_row_not_visible')
  const item = mocks.listPanel?.sortedListItems.find((entry) => entry.kind === 'local')
  if (!item || item.kind !== 'local') {
    throw new Error('missing local fixture')
  }
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction(
      AutomationViewerActionSchema.parse({ kind: 'editor-edit', source: 'local', rowKey: item.id })
    )
  })
  await expect(request).resolves.toMatchObject({
    editor: { open: true, rowKey: item.id, automationId: item.row.automation.id }
  })
  expect(mocks.editorDialog).toMatchObject({ open: true, isEditing: true })
  expect(api.automations.update).not.toHaveBeenCalled()
})

it('opens the existing external editor with the exact visible owner and job', async () => {
  api.automations.listExternalManagerForOwner.mockImplementation(
    async ({ provider }: { provider: string }) =>
      provider === 'hermes'
        ? { manager: makeExternalManager(), error: null, updatedAt: 1 }
        : { manager: null, error: null, updatedAt: 1 }
  )
  await renderPage()
  await settleHostQueries()
  const item = mocks.listPanel?.sortedListItems.find((entry) => entry.kind === 'external')
  if (!item || item.kind !== 'external') {
    throw new Error('missing external fixture')
  }
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction(
      AutomationViewerActionSchema.parse({
        kind: 'editor-edit',
        source: 'external',
        rowKey: item.id
      })
    )
  })
  await expect(request).resolves.toMatchObject({
    editor: { open: true, target: 'hermes', externalJobId: item.entry.job.id }
  })
  expect(mocks.editorDialog?.open).toBe(true)
  expect(api.automations.updateExternalForOwner).not.toHaveBeenCalled()
  expect(api.automations.runExternalActionForOwner).not.toHaveBeenCalled()
})

it('preserves the external edit button capability guard', async () => {
  api.automations.listExternalManagerForOwner.mockImplementation(
    async ({ provider }: { provider: string }) =>
      provider === 'hermes'
        ? { manager: { ...makeExternalManager(), canManage: false }, error: null, updatedAt: 1 }
        : { manager: null, error: null, updatedAt: 1 }
  )
  await renderPage()
  await settleHostQueries()
  const item = mocks.listPanel?.sortedListItems.find((entry) => entry.kind === 'external')
  if (!item || item.kind !== 'external') {
    throw new Error('missing external fixture')
  }
  await expect(
    applyAutomationViewerAction({ kind: 'editor-edit', source: 'external', rowKey: item.id })
  ).rejects.toThrow('automation_edit_unavailable')
  expect(mocks.editorDialog?.open).toBe(false)
  expect(api.automations.updateExternalForOwner).not.toHaveBeenCalled()
})
