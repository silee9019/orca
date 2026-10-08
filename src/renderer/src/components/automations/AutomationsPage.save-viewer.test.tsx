// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import { AutomationEditorDialogFooter } from './AutomationEditorDialogFooter'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  scopedList,
  settleHostQueries
} from './automations-page-test-harness'
import { makeAutomation, REPO_ID, WORKSPACE_ID } from './automations-page-fixtures'
import { buildAutomationEditDraft } from './automation-edit-draft'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
installAutomationsPageHarness()
afterEach(() => {
  cleanup()
  api.automations.create.mockReset()
  vi.restoreAllMocks()
})
let apply: typeof applyAutomationViewerAction
const created = makeAutomation({ id: 'created', name: 'Saved task', prompt: 'Saved prompt' })
async function mountPage() {
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
  return view
}
async function openValidEditor() {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'editor-create' })
  })
  await pending
  await act(async () => {
    mocks.editorDialog?.onDraftChange(() =>
      buildAutomationEditDraft(
        makeAutomation({
          name: 'Saved task',
          prompt: 'Saved prompt',
          projectId: REPO_ID,
          workspaceId: WORKSPACE_ID,
          workspaceMode: 'existing'
        })
      )
    )
  })
  const review = (await apply({ kind: 'get' })).saveReview
  if (!review) {
    throw new Error('Missing save review')
  }
  expect(review.canSave).toBe(true)
  return review
}
function persisted() {
  api.automations.list.mockResolvedValue([created])
  scopedList([created])
  return created
}

it('shares the actual Save callback and CLI transaction with persisted read-back', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(10000)
  api.automations.create.mockImplementation(async () => persisted())
  await mountPage()
  const uiReview = await openValidEditor()
  const saveCallback = mocks.editorDialog?.onSave
  if (!saveCallback) {
    throw new Error('Missing Save callback')
  }
  const footer = render(
    <AutomationEditorDialogFooter
      isEditing={false}
      isEditingExternal={false}
      isHermesCreate={false}
      isSaving={uiReview.saving}
      canSave={uiReview.canSave}
      hasProjects={true}
      onOpenChange={() => undefined}
      onSave={saveCallback}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))
  await waitFor(() => expect(mocks.editorDialog?.open).toBe(false))
  expect(api.automations.create).toHaveBeenCalledTimes(1)
  footer.unmount()
  const review = await openValidEditor()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'editor-save',
      reviewedTarget: review.reviewedTarget,
      reviewedDraft: review.reviewedDraft
    })
  })
  await expect(pending).resolves.toMatchObject({
    editor: { open: false },
    save: {
      outcome: {
        status: 'settled',
        write: { provider: 'orca', operation: 'create', automationId: 'created' },
        pageRead: 'completed'
      },
      closeCommitted: true
    }
  })
  expect((await apply({ kind: 'get' })).saveReview?.lastResult).toMatchObject({
    requestReview: { reviewedTarget: review.reviewedTarget, reviewedDraft: review.reviewedDraft },
    outcome: { status: 'settled', write: { automationId: 'created' } },
    closeCommitted: true
  })
  expect(api.automations.create).toHaveBeenCalledTimes(2)
  expect(api.automations.create.mock.calls[0]).toEqual(api.automations.create.mock.calls[1])
  expect(
    mocks.listPanel?.sortedListItems.some(
      (item) => item.kind === 'local' && item.row.automation.id === 'created'
    )
  ).toBe(true)
})

it('waits for save acknowledgement and blocks competing editor mutations', async () => {
  await mountPage()
  const review = await openValidEditor()
  let finish!: (value: ReturnType<typeof makeAutomation>) => void
  api.automations.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let pending: ReturnType<typeof apply> | undefined
  let settled = false
  await act(async () => {
    pending = apply({
      kind: 'editor-save',
      reviewedTarget: review.reviewedTarget,
      reviewedDraft: review.reviewedDraft
    })
    void pending.then(() => {
      settled = true
    })
  })
  expect(settled).toBe(false)
  expect((await apply({ kind: 'get' })).saveReview?.busy).toBe(true)
  await expect(apply({ kind: 'editor-create' })).rejects.toThrow('viewer_busy')
  await act(async () => {
    finish(persisted())
  })
  await expect(pending).resolves.toMatchObject({ save: { closeCommitted: true } })
})

it('rejects a changed draft review without writing', async () => {
  await mountPage()
  const review = await openValidEditor()
  await act(async () => {
    mocks.editorDialog?.onDraftChange(() =>
      buildAutomationEditDraft(makeAutomation({ prompt: 'changed draft' }))
    )
  })
  await expect(
    apply({
      kind: 'editor-save',
      reviewedTarget: review.reviewedTarget,
      reviewedDraft: review.reviewedDraft
    })
  ).rejects.toThrow('viewer_target_changed')
  expect(api.automations.create).not.toHaveBeenCalled()
})

it('reports an uncertain failed write while preserving the editor', async () => {
  await mountPage()
  const review = await openValidEditor()
  api.automations.create.mockRejectedValueOnce(new Error('fixture transport unavailable'))
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'editor-save',
      reviewedTarget: review.reviewedTarget,
      reviewedDraft: review.reviewedDraft
    })
  })
  await expect(pending).resolves.toMatchObject({
    editor: { open: true },
    save: { outcome: { status: 'failed', write: 'unknown' }, closeCommitted: false }
  })
})

it('retains the acknowledged write when later UI hydration fails', async () => {
  await mountPage()
  const review = await openValidEditor()
  api.automations.create.mockImplementationOnce(async () => persisted())
  mocks.state.hydratePersistedUI = () => {
    throw new Error('fixture hydration failed')
  }
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'editor-save',
      reviewedTarget: review.reviewedTarget,
      reviewedDraft: review.reviewedDraft
    })
  })
  await expect(pending).resolves.toMatchObject({
    editor: { open: true },
    save: {
      outcome: {
        status: 'settled',
        write: { automationId: 'created' },
        pageRead: null,
        closeRequested: false
      },
      closeCommitted: false
    }
  })
  expect(api.automations.create).toHaveBeenCalledTimes(1)
})

it('reports invalid input without writing or closing the editor', async () => {
  await mountPage()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'editor-create' })
  })
  await pending
  await act(async () => {
    mocks.editorDialog?.onDraftChange(() =>
      buildAutomationEditDraft(makeAutomation({ prompt: '' }))
    )
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
    editor: { open: true },
    save: { outcome: { status: 'blocked', reason: 'location-or-prompt' }, closeCommitted: false }
  })
  expect(api.automations.create).not.toHaveBeenCalled()
})
