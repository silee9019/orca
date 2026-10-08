import { useAppStore } from '@/store'
import type { AutomationHostRecoveryAction } from './automation-host-status-descriptors'
// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import { AutomationEditorDialog } from './AutomationEditorDialog'
import { buildAutomationEditDraft } from './automation-edit-draft'
import { makeAutomation } from './automations-page-fixtures'
import type { AutomationActionNotice } from './automation-row-action-dispatch'
import { applyAutomationEditorViewerAction as apply } from '../../runtime/automation-editor-viewer-controller'

vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'profile' })
})
afterEach(cleanup)
const first: AutomationActionNotice = {
  message: 'Owner changed',
  severity: 'owner',
  recovery: null
}
const replacement: AutomationActionNotice = { ...first }
function Harness({
  notice = first,
  owner = 'runtime:4',
  hold = false,
  dismiss,
  recover,
  saving = false,
  available = true
}: {
  notice?: AutomationActionNotice | null
  owner?: string
  hold?: boolean
  dismiss: () => void
  recover?: (action: AutomationHostRecoveryAction) => void
  saving?: boolean
  available?: boolean
}) {
  const [hidden, setHidden] = useState(false)
  return (
    <TooltipProvider>
      <AutomationEditorDialog
        open
        isEditing
        isEditingExternal={false}
        isSaving={saving}
        canSave
        createTarget="hermes"
        repos={[]}
        projectHostSetups={[]}
        automationYamlHooksByRepoKey={{}}
        getAutomationHooksCacheKey={(id) => id}
        repoMap={new Map()}
        worktrees={[]}
        settings={null}
        draft={buildAutomationEditDraft(makeAutomation())}
        notice={hidden ? null : notice}
        noticeOwnerKey={owner}
        onNoticeRecover={
          recover
            ? (action) => {
                recover(action)
                if (!hold) {
                  setHidden(true)
                }
              }
            : undefined
        }
        onNoticeDismiss={
          available
            ? () => {
                dismiss()
                if (!hold) {
                  setHidden(true)
                }
              }
            : undefined
        }
        onProjectChange={() => undefined}
        onCreateTargetChange={() => undefined}
        onOpenChange={() => undefined}
        onDraftChange={() => undefined}
        onSetupDecisionTouched={() => undefined}
        onApplyTemplate={() => undefined}
        onSave={() => undefined}
      />
    </TooltipProvider>
  )
}
async function request() {
  const state = await apply({ kind: 'get' })
  return {
    kind: 'notice-dismiss' as const,
    reviewedTarget: state.reviewedTarget,
    reviewedNotice: state.notice.reviewedTarget
  }
}
it('uses the actual Dismiss callback and waits for parent commit, including while saving', async () => {
  const dismiss = vi.fn()
  const view = render(<Harness dismiss={dismiss} hold saving />)
  const action = await request()
  let pending: ReturnType<typeof apply> | undefined
  let settled = false
  await act(async () => {
    pending = apply(action)
    void pending.then(() => {
      settled = true
    })
  })
  expect(dismiss).toHaveBeenCalledTimes(1)
  expect(settled).toBe(false)
  expect(screen.getByRole('alert').textContent).toContain(first.message)
  await expect(apply(action)).rejects.toThrow('viewer_busy')
  expect((await apply({ kind: 'get' })).notice.value).toEqual(first)
  view.rerender(<Harness dismiss={dismiss} notice={null} saving />)
  await expect(pending).resolves.toMatchObject({
    isSaving: true,
    notice: { value: null, canDismiss: false }
  })
  expect(screen.queryByRole('alert')).toBeNull()
  await expect(apply(await request())).rejects.toThrow('automation_notice_unavailable')
  view.unmount()
  render(<Harness dismiss={dismiss} saving />)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(dismiss).toHaveBeenCalledTimes(2)
  expect((await apply({ kind: 'get' })).notice.value).toBeNull()
})
it('invalidates replaced notices and owner revisions before invoking the callback', async () => {
  const dismiss = vi.fn()
  const view = render(<Harness dismiss={dismiss} />)
  const action = await request()
  view.rerender(<Harness dismiss={dismiss} notice={replacement} />)
  await expect(apply(action)).rejects.toThrow('viewer_target_changed')
  const next = await request()
  view.rerender(<Harness dismiss={dismiss} notice={replacement} owner="runtime:9" />)
  await expect(apply(next)).rejects.toThrow('viewer_target_changed')
  expect(dismiss).not.toHaveBeenCalled()
  let pending: ReturnType<typeof apply> | undefined
  const current = await request()
  view.rerender(<Harness dismiss={dismiss} notice={replacement} owner="runtime:9" hold />)
  await act(async () => {
    pending = apply(current)
    void pending.catch(() => undefined)
  })
  view.rerender(<Harness dismiss={dismiss} notice={null} owner="runtime:10" hold />)
  await expect(pending).rejects.toThrow('viewer_target_changed')
})
it('rejects unavailable, unmounted and ambiguous editors without invoking extra callbacks', async () => {
  const dismiss = vi.fn()
  const view = render(<Harness dismiss={dismiss} available={false} />)
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  await expect(apply(await request())).rejects.toThrow('automation_notice_unavailable')
  view.rerender(<Harness dismiss={dismiss} hold />)
  let pending: ReturnType<typeof apply> | undefined
  const action = await request()
  await act(async () => {
    pending = apply(action)
    void pending.catch(() => undefined)
  })
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
  render(
    <>
      <Harness dismiss={dismiss} />
      <Harness dismiss={dismiss} />
    </>
  )
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
  expect(dismiss).toHaveBeenCalledTimes(1)
})

const recoverable: AutomationActionNotice = { ...first, recovery: 'retry' }
it('reuses the actual Retry callback and acknowledges the reviewed recovery request', async () => {
  const recover = vi.fn()
  const view = render(<Harness notice={recoverable} dismiss={() => undefined} recover={recover} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(recover).toHaveBeenCalledExactlyOnceWith('retry')
  expect(screen.queryByRole('alert')).toBeNull()
  view.unmount()
  render(<Harness notice={recoverable} dismiss={() => undefined} recover={recover} />)
  const review = await request()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ ...review, kind: 'notice-recover', action: 'retry' })
    void pending.catch(() => undefined)
  })
  await expect(pending).resolves.toMatchObject({
    notice: { value: null },
    noticeRecovery: { requested: 'retry', reviewStatus: 'current' }
  })
  expect(recover).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).toBeNull()
})
it('binds recovery to the exact offered notice and invalidates reviews across profile ABA', async () => {
  const recover = vi.fn()
  render(<Harness notice={recoverable} dismiss={() => undefined} recover={recover} />)
  const before = await request()
  await expect(apply({ ...before, kind: 'notice-recover', action: 'reconnect' })).rejects.toThrow(
    'automation_notice_unavailable'
  )
  act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
  act(() => useAppStore.setState({ activeOrcaProfileId: 'profile' }))
  await expect(apply({ ...before, kind: 'notice-recover', action: 'retry' })).rejects.toThrow(
    'viewer_target_changed'
  )
  expect(recover).not.toHaveBeenCalled()
})
it('waits for notice clearing and reports the requested old review when recovery changes owner state', async () => {
  const recover = vi.fn()
  const view = render(
    <Harness notice={recoverable} dismiss={() => undefined} recover={recover} hold />
  )
  const review = await request()
  let pending: ReturnType<typeof apply> | undefined
  let settled = false
  await act(async () => {
    pending = apply({ ...review, kind: 'notice-recover', action: 'retry' })
    void pending.then(() => {
      settled = true
    })
  })
  expect(settled).toBe(false)
  await expect(apply({ ...review, kind: 'notice-recover', action: 'retry' })).rejects.toThrow(
    'viewer_busy'
  )
  view.rerender(
    <Harness notice={null} owner="runtime:5" dismiss={() => undefined} recover={recover} />
  )
  await expect(pending).resolves.toMatchObject({
    noticeRecovery: { requested: 'retry', reviewStatus: 'changed' }
  })
  expect(recover).toHaveBeenCalledExactlyOnceWith('retry')
})

it('releases failed recovery callbacks and rejects owner changes while the notice remains', async () => {
  const recover = vi.fn((): void => {
    throw new Error('recovery failed')
  })
  const view = render(
    <Harness notice={recoverable} dismiss={() => undefined} recover={recover} hold />
  )
  const review = await request()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ ...review, kind: 'notice-recover', action: 'retry' })
    void pending.catch(() => undefined)
  })
  await expect(pending).rejects.toThrow('recovery failed')
  recover.mockImplementation(() => undefined)
  await act(async () => {
    pending = apply({ ...review, kind: 'notice-recover', action: 'retry' })
    void pending.catch(() => undefined)
  })
  view.rerender(
    <Harness
      notice={recoverable}
      owner="runtime:5"
      dismiss={() => undefined}
      recover={recover}
      hold
    />
  )
  await expect(pending).rejects.toThrow('viewer_target_changed')
  expect(recover).toHaveBeenCalledTimes(2)
})
