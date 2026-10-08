// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { buildAutomationEditDraft } from '../components/automations/automation-edit-draft'
import { makeAutomation } from '../components/automations/automations-page-fixtures'
import type { AutomationSaveAction } from '../components/automations/automation-save-action'
import type { AutomationSaveOutcome } from '../components/automations/automation-save-outcome'
import {
  applyAutomationSaveViewer as apply,
  automationSaveReviewSnapshot as snapshot,
  useAutomationSaveViewer
} from './automation-save-viewer'

const save = vi.fn<AutomationSaveAction>()
const draft = buildAutomationEditDraft(makeAutomation())
function Harness({ owner = 'pairing:4' }: { owner?: string }) {
  useAutomationSaveViewer({
    open: true,
    saving: false,
    canSave: true,
    draft,
    ownerKey: owner,
    createTarget: 'orca',
    onSave: save
  })
  return null
}
function review() {
  const state = snapshot()
  if (!state) {
    throw new Error('Missing save review')
  }
  return state
}
afterEach(() => {
  cleanup()
  save.mockReset()
})

it('keeps an acknowledged write visible when its owner changes during the request', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const view = render(<Harness />)
  let finish!: (outcome: AutomationSaveOutcome) => void
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const before = review()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(before.reviewedTarget, before.reviewedDraft)
  })
  view.rerender(<Harness owner="pairing:9" />)
  expect(review().busy).toBe(true)
  await act(async () => {
    finish({
      status: 'settled',
      write: {
        provider: 'orca',
        operation: 'move',
        automationId: 'destination-copy',
        originalRemoved: false
      },
      pageRead: 'failed',
      closeRequested: false
    })
  })
  await expect(pending).resolves.toMatchObject({
    reviewStatus: 'changed',
    busy: false,
    closeCommitted: false,
    outcome: {
      write: { automationId: 'destination-copy', originalRemoved: false },
      pageRead: 'failed'
    }
  })
})

it('rejects an old owner review before invoking Save', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const view = render(<Harness />)
  const before = review()
  view.rerender(<Harness owner="pairing:9" />)
  await expect(apply(before.reviewedTarget, before.reviewedDraft)).rejects.toThrow(
    'viewer_target_changed'
  )
  expect(save).not.toHaveBeenCalled()
})

it('rejects an unmounted parent and ignores a late Save acknowledgement', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const view = render(<Harness />)
  let finish!: (outcome: AutomationSaveOutcome) => void
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const before = review()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(before.reviewedTarget, before.reviewedDraft)
    void pending.catch(() => undefined)
  })
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    finish({ status: 'failed', write: 'unknown' })
  })
  expect(snapshot()).toBeNull()
})
