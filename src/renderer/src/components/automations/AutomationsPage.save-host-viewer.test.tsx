// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import { hostStableKey } from '../../../../shared/automation-owner-key'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  scopedList,
  settleHostQueries,
  runtimeHost,
  addRuntimeProject,
  RUNTIME_ID,
  RUNTIME_REPO_ID,
  RUNTIME_WORKSPACE_ID
} from './automations-page-test-harness'
import {
  makeAutomation,
  makeExternalManager,
  REPO_ID,
  WORKSPACE_ID
} from './automations-page-fixtures'
import { buildAutomationEditDraft } from './automation-edit-draft'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'

installAutomationsPageHarness()
afterEach(() => {
  cleanup()
  api.automations.delete.mockReset()
  api.automations.updateExternalForOwner.mockReset()
})
let apply: typeof applyAutomationViewerAction
async function mountPage() {
  vi.resetModules()
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  render(
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  await settleHostQueries()
}
async function submit() {
  const review = (await apply({ kind: 'get' })).saveReview
  if (!review) {
    throw new Error('Missing save review')
  }
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'editor-save',
      reviewedTarget: review.reviewedTarget,
      reviewedDraft: review.reviewedDraft
    })
  })
  return pending
}

it('updates Hermes through the captured manager scope and returns its acknowledgement', async () => {
  const manager = makeExternalManager()
  api.automations.listExternalManagerForOwner.mockImplementation(
    async ({ provider }: { provider: string }) => ({
      manager: provider === 'hermes' ? manager : null,
      error: null,
      updatedAt: 1
    })
  )
  api.automations.updateExternalForOwner.mockResolvedValue(undefined)
  await mountPage()
  const item = mocks.listPanel?.sortedListItems.find((entry) => entry.kind === 'external')
  if (!item || item.kind !== 'external') {
    throw new Error('Missing external row')
  }
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'editor-edit', source: 'external', rowKey: item.id })
  })
  await pending
  await act(async () => {
    mocks.editorDialog?.onDraftChange(() =>
      buildAutomationEditDraft(
        makeAutomation({ projectId: REPO_ID, workspaceId: WORKSPACE_ID, workspaceMode: 'existing' })
      )
    )
  })
  await expect(submit()).resolves.toMatchObject({
    save: {
      outcome: {
        status: 'settled',
        write: { provider: 'hermes', operation: 'update', automationId: item.entry.job.id }
      },
      closeCommitted: true
    }
  })
  expect(api.automations.updateExternalForOwner).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ ...item.entry.scope, jobId: item.entry.job.id })
  )
  expect(api.automations.create).not.toHaveBeenCalled()
  expect(api.automations.update).not.toHaveBeenCalled()
})

it('reports two copies when the destination write succeeds and source deletion fails', async () => {
  const source = makeAutomation({ id: 'source' })
  const moved = makeAutomation({
    id: 'destination-copy',
    projectId: RUNTIME_REPO_ID,
    workspaceId: RUNTIME_WORKSPACE_ID
  })
  scopedList([source])
  api.automations.list.mockResolvedValue([source])
  runtimeHost([], [])
  addRuntimeProject()
  const previous = mocks.callRuntimeRpc.getMockImplementation()
  mocks.callRuntimeRpc.mockImplementation(
    async (target: unknown, method: string, params: unknown, options: unknown) => {
      if (method === 'automation.create') {
        mocks.state.runtimeAnswers = { automations: [moved], runs: [] }
        return { automation: moved }
      }
      return previous?.(target, method, params, options)
    }
  )
  api.automations.delete.mockRejectedValueOnce(new Error('fixture source deletion failed'))
  await mountPage()
  const item = mocks.listPanel?.sortedListItems.find(
    (entry) => entry.kind === 'local' && entry.row.automation.id === 'source'
  )
  if (!item || item.kind !== 'local') {
    throw new Error('Missing source row')
  }
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'editor-edit', source: 'local', rowKey: item.id })
  })
  await pending
  await act(async () => {
    mocks.editorDialog?.editDestination?.onSelect(
      hostStableKey({
        authority: { kind: 'runtime', environmentId: RUNTIME_ID },
        selector: { kind: 'self' }
      })
    )
  })
  await act(async () => {
    mocks.editorDialog?.onDraftChange(() =>
      buildAutomationEditDraft(
        makeAutomation({
          id: source.id,
          projectId: RUNTIME_REPO_ID,
          workspaceId: RUNTIME_WORKSPACE_ID,
          workspaceMode: 'existing'
        })
      )
    )
  })
  await expect(submit()).resolves.toMatchObject({
    save: {
      outcome: {
        status: 'settled',
        write: {
          provider: 'orca',
          operation: 'move',
          automationId: 'destination-copy',
          originalRemoved: false
        }
      }
    }
  })
  expect(
    mocks.callRuntimeRpc.mock.calls.filter((call) => call[1] === 'automation.create')
  ).toHaveLength(1)
  expect(api.automations.delete).toHaveBeenCalledWith(expect.objectContaining({ id: 'source' }))
  expect(mocks.toastSuccess).not.toHaveBeenCalled()
})

it('updates the exact reviewed existing row through its owner-qualified save path', async () => {
  await mountPage()
  const item = mocks.listPanel?.sortedListItems.find((entry) => entry.kind === 'local')
  if (!item || item.kind !== 'local') {
    throw new Error('Missing local row')
  }
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'editor-edit', source: 'local', rowKey: item.id })
  })
  await pending
  const updated = makeAutomation({
    id: item.row.automation.id,
    name: 'Updated task',
    prompt: 'Updated prompt'
  })
  await act(async () => {
    mocks.editorDialog?.onDraftChange(() => buildAutomationEditDraft(updated))
  })
  api.automations.update.mockImplementationOnce(async () => {
    api.automations.list.mockResolvedValue([updated])
    scopedList([updated])
    return updated
  })
  const review = (await apply({ kind: 'get' })).saveReview
  if (!review) {
    throw new Error('Missing save review')
  }
  await act(async () => {
    pending = apply({
      kind: 'editor-save',
      reviewedTarget: review.reviewedTarget,
      reviewedDraft: review.reviewedDraft
    })
  })
  await expect(pending).resolves.toMatchObject({
    save: {
      outcome: { status: 'settled', write: { operation: 'update', automationId: updated.id } },
      closeCommitted: true
    }
  })
  expect(api.automations.update).toHaveBeenCalledTimes(1)
  expect(api.automations.create).not.toHaveBeenCalled()
})
