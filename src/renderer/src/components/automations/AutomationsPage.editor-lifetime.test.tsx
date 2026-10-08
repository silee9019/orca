// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  api,
  installAutomationsPageHarness,
  mocks,
  scopedList,
  settleHostQueries
} from './automations-page-test-harness'
import AutomationsPage from './AutomationsPage'
import { makeAutomation } from './automations-page-fixtures'
import { selfScopedList } from './automations-page-runtime-fixtures'
import {
  AutomationOwnerConflictError,
  AUTOMATION_OWNER_CONFLICT_CODES
} from '../../../../shared/automation-owner-conflict'
import { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'

installAutomationsPageHarness()
afterEach(cleanup)

it('keeps local edit pending through the owner reread and drops its late result after unmount', async () => {
  const page = render(<AutomationsPage />)
  await settleHostQueries()
  const rowKey = (await applyAutomationViewerAction({ kind: 'get' })).visibleRowKeys[0]
  if (!rowKey) {
    throw new Error('missing row')
  }
  let release: ((value: Record<string, unknown>) => void) | undefined
  api.automations.listScoped.mockImplementationOnce(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        release = resolve
      })
  )
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'editor-edit', source: 'local', rowKey })
    void request.catch(() => undefined)
  })
  await expect(applyAutomationViewerAction({ kind: 'get' })).resolves.toMatchObject({
    editor: { open: false }
  })
  await expect(applyAutomationViewerAction({ kind: 'query', value: 'changed' })).rejects.toThrow(
    'viewer_busy'
  )
  page.unmount()
  await expect(request).rejects.toThrow('viewer_unmounted')
  await act(async () => release?.(selfScopedList([makeAutomation()])))
  expect(mocks.editorDialog?.open).toBe(false)
  await expect(applyAutomationViewerAction({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})

it('does not reopen an editor for a row removed during its owner reread', async () => {
  render(<AutomationsPage />)
  await settleHostQueries()
  const rowKey = (await applyAutomationViewerAction({ kind: 'get' })).visibleRowKeys[0]
  if (!rowKey) {
    throw new Error('missing row')
  }
  let release: ((value: Record<string, unknown>) => void) | undefined
  api.automations.listScoped.mockImplementationOnce(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        release = resolve
      })
  )
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'editor-edit', source: 'local', rowKey })
    void request.catch(() => undefined)
  })
  scopedList([])
  await act(async () => mocks.listPanel?.onRefresh())
  await settleHostQueries()
  await expect(applyAutomationViewerAction({ kind: 'get' })).resolves.toMatchObject({
    visibleRowKeys: []
  })
  await act(async () => release?.(selfScopedList([makeAutomation()])))
  await expect(request).rejects.toThrow('viewer_target_changed')
  expect(mocks.editorDialog?.open).toBe(false)
  expect(api.automations.update).not.toHaveBeenCalled()
})

it('preserves owner conflict handling and does not claim a closed editor opened', async () => {
  render(<AutomationsPage />)
  await settleHostQueries()
  const rowKey = (await applyAutomationViewerAction({ kind: 'get' })).visibleRowKeys[0]
  if (!rowKey) {
    throw new Error('missing row')
  }
  api.automations.listScoped.mockRejectedValueOnce(
    new AutomationOwnerConflictError(AUTOMATION_OWNER_CONFLICT_CODES.ownerChanged)
  )
  let request: ReturnType<typeof applyAutomationViewerAction> | undefined
  await act(async () => {
    request = applyAutomationViewerAction({ kind: 'editor-edit', source: 'local', rowKey })
    void request.catch(() => undefined)
  })
  await expect(request).rejects.toThrow('viewer_target_changed')
  expect(mocks.editorDialog?.open).toBe(false)
  expect(document.body.textContent).toContain("This automation's host changed")
  expect(api.automations.update).not.toHaveBeenCalled()
})
