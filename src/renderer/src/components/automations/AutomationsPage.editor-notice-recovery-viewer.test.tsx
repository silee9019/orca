// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import {
  installAutomationsPageHarness,
  api,
  settleHostQueries
} from './automations-page-test-harness'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
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
  vi.doUnmock('./AutomationEditorDialog')
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
  await request({ kind: 'editor-edit', source: 'local', rowKey })
  await settleHostQueries()
  const review = (await apply({ kind: 'get' })).saveReview
  if (!review?.canSave) {
    throw new Error('missing save review')
  }
  api.automations.update.mockRejectedValueOnce(new Error('write unavailable'))
  await request({
    kind: 'editor-save',
    reviewedTarget: review.reviewedTarget,
    reviewedDraft: review.reviewedDraft
  })
  await settleHostQueries()
  const form = (await request({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
  if (!form?.notice.value) {
    throw new Error('missing failure notice')
  }
  return { view, form }
}
it('uses actual Page notice recovery, dismissal and close callbacks without another write', async () => {
  const native = await mount()
  expect(native.form.notice.value?.recovery).toBe('retry')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await settleHostQueries()
  await waitFor(async () =>
    expect(
      (await request({ kind: 'editor-form', action: { kind: 'get' } })).editorForm?.notice.value
    ).toBeNull()
  )
  native.view.unmount()
  const cli = await mount()
  const result = await request({
    kind: 'editor-form',
    action: {
      kind: 'notice-recover',
      action: 'retry',
      reviewedTarget: cli.form.reviewedTarget,
      reviewedNotice: cli.form.notice.reviewedTarget
    }
  })
  expect(result.editorForm).toMatchObject({
    notice: { value: null },
    noticeRecovery: { requested: 'retry' }
  })
  expect(api.automations.update).toHaveBeenCalledTimes(2)
  cli.view.unmount()
  const dismiss = await mount()
  await request({
    kind: 'editor-form',
    action: {
      kind: 'notice-dismiss',
      reviewedTarget: dismiss.form.reviewedTarget,
      reviewedNotice: dismiss.form.notice.reviewedTarget
    }
  })
  expect(
    (await request({ kind: 'editor-form', action: { kind: 'get' } })).editorForm?.notice.value
  ).toBeNull()
  dismiss.view.unmount()
  const close = await mount()
  const closed = await request({
    kind: 'editor-form',
    action: { kind: 'close', reviewedTarget: close.form.reviewedTarget }
  })
  expect(closed.editorForm).toMatchObject({ open: false, notice: { value: null } })
  expect(api.automations.update).toHaveBeenCalledTimes(4)
})
