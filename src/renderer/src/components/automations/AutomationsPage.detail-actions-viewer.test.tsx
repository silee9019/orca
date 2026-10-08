// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  settleHostQueries
} from './automations-page-test-harness'
import { makeExternalManager } from './automations-page-fixtures'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
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
async function mount(source: 'local' | 'external', canManage = true, enabled = true) {
  vi.resetModules()
  vi.doUnmock('./AutomationsDetailPane')
  if (source === 'external') {
    mocks.state.sshTargetLabels = new Map([['ssh-test', 'SSH test']])
    mocks.state.sshTargetGenerations = new Map([['ssh-test', 1]])
    mocks.state.sshConnectionStates = new Map([['ssh-test', { status: 'connected' }]])
    mocks.state.automationHostFilter = {
      kind: 'host',
      host: { authority: { kind: 'desktop' }, selector: { kind: 'ssh', targetId: 'ssh-test' } }
    }
    const manager = makeExternalManager()
    manager.canManage = canManage
    manager.jobs = manager.jobs.map((job) => ({ ...job, enabled }))
    api.automations.listExternalManagerForOwner.mockImplementation(async ({ provider }) => ({
      manager: provider === 'hermes' ? manager : null,
      error: null,
      updatedAt: 1
    }))
    api.automations.listExternalRunsForOwner.mockResolvedValue({ runs: [], total: 0 })
    api.automations.runExternalActionForOwner.mockResolvedValue(undefined)
  }
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  const markup = () => (
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  const view = render(markup())
  await settleHostQueries()
  const state = await apply({ kind: 'get' })
  const rowKey = state.visibleRowKeys.find((key) =>
    source === 'external' ? key.includes('job-1') : !key.includes('job-1')
  )
  if (!rowKey) {
    throw new Error('missing row')
  }
  await request({ kind: 'select', source, rowKey })
  await settleHostQueries()
  return { view, rowKey, redraw: () => view.rerender(markup()) }
}
it.each(['local', 'external'] as const)(
  'shares %s detail edit and delete targets with the existing root actions',
  async (source) => {
    for (const action of ['edit', 'delete'] as const) {
      const native = await mount(source)
      fireEvent.click(
        screen.getByRole('button', {
          name: `${action === 'edit' ? 'Edit' : 'Delete'} ${source === 'external' ? 'external ' : ''}automation`
        })
      )
      await settleHostQueries()
      await waitFor(async () => {
        const state = await apply({ kind: 'get' })
        expect(action === 'edit' ? state.editor.open : state.deletion?.open).toBe(true)
      })
      const before = await apply({ kind: 'get' })
      const target =
        action === 'edit'
          ? {
              rowKey: before.editor.rowKey,
              id: before.editor.automationId,
              externalJobId: before.editor.externalJobId,
              target: before.editor.target
            }
          : { rowKey: before.deletion?.rowKey, id: before.deletion?.definitionId }
      if (source === 'external' && action === 'edit') {
        expect(target).toMatchObject({ externalJobId: 'job-1' })
      } else {
        expect(target.rowKey).toBe(native.rowKey)
      }
      native.view.unmount()
      await mount(source)
      const cli = await request(
        action === 'edit'
          ? { kind: 'editor-edit', source, rowKey: native.rowKey }
          : { kind: 'delete-form', action: { kind: 'request', source, rowKey: native.rowKey } }
      )
      expect(
        action === 'edit'
          ? {
              rowKey: cli.editor.rowKey,
              id: cli.editor.automationId,
              externalJobId: cli.editor.externalJobId,
              target: cli.editor.target
            }
          : { rowKey: cli.deletion?.rowKey, id: cli.deletion?.definitionId }
      ).toEqual(target)
      expect(api.automations.delete).not.toHaveBeenCalled()
      expect(api.automations.runExternalActionForOwner).not.toHaveBeenCalled()
      cleanup()
    }
  }
)
it.each(['local', 'external'] as const)(
  'shares %s detail run and pause dispatch with reviewed row actions',
  async (source) => {
    for (const kind of ['run', 'toggle', 'resume'] as const) {
      if (kind === 'resume' && source === 'local') {
        continue
      }
      const command = kind === 'resume' ? 'toggle' : kind
      const native = await mount(source, true, kind !== 'resume')
      const dispatch =
        source === 'external'
          ? api.automations.runExternalActionForOwner
          : kind === 'run'
            ? api.automations.runNow
            : api.automations.update
      dispatch.mockClear()
      if (source === 'external' && kind !== 'run') {
        fireEvent.click(screen.getByRole('switch'))
      } else {
        const label =
          source === 'external'
            ? 'Run external automation'
            : kind === 'run'
              ? 'Run Now'
              : 'Pause automation'
        fireEvent.click(screen.getByRole('button', { name: label }))
      }
      await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
      const nativeArgs = dispatch.mock.calls[0]
      if (source === 'external') {
        expect(nativeArgs?.[0]).toMatchObject({
          action: kind === 'run' ? 'run' : kind === 'resume' ? 'resume' : 'pause',
          owner: {
            authority: { kind: 'desktop' },
            selector: { kind: 'ssh', targetId: 'ssh-test', targetGeneration: 1 }
          }
        })
      }
      await settleHostQueries()
      native.view.unmount()
      await mount(source, true, kind !== 'resume')
      dispatch.mockClear()
      const form = (await apply({ kind: 'row-form', action: { kind: 'get' } })).rowForm
      if (!form) {
        throw new Error('missing review')
      }
      const cli = await request({
        kind: 'row-form',
        action: { kind: command, rowKey: native.rowKey, reviewedTarget: form.reviewedTarget }
      })
      expect(cli.rowForm?.outcome?.mutation).toBe('acknowledged')
      expect(dispatch).toHaveBeenCalledExactlyOnceWith(...(nativeArgs ?? []))
      cleanup()
    }
  }
)
it.each(['local', 'external'] as const)(
  'returns from the %s detail pane through native and public list navigation',
  async (source) => {
    const native = await mount(source)
    fireEvent.click(screen.getByRole('button', { name: 'All automations' }))
    await settleHostQueries()
    const before = await apply({ kind: 'get' })
    expect(before.detailOpen).toBe(false)
    native.view.unmount()
    await mount(source)
    const cli = await request({ kind: 'navigate', value: 'list' })
    expect(cli.detailOpen).toBe(false)
  }
)

it('guards external row actions with fresh review, modal and manager permissions', async () => {
  const page = await mount('external')
  const before = (await apply({ kind: 'row-form', action: { kind: 'get' } })).rowForm
  if (!before) {
    throw new Error('missing review')
  }
  expect(before.externalRows).toEqual([
    expect.objectContaining({ rowKey: page.rowKey, ownerAllowsRun: true })
  ])
  const originalProfile = mocks.state.activeOrcaProfileId
  act(() => {
    mocks.state.activeOrcaProfileId = 'other'
    page.redraw()
  })
  act(() => {
    mocks.state.activeOrcaProfileId = originalProfile
    page.redraw()
  })
  await expect(
    request({
      kind: 'row-form',
      action: { kind: 'run', rowKey: page.rowKey, reviewedTarget: before.reviewedTarget }
    })
  ).rejects.toThrow('viewer_target_changed')
  act(() => {
    mocks.state.activeModal = 'worktree-palette'
    page.redraw()
  })
  const current = (await apply({ kind: 'row-form', action: { kind: 'get' } })).rowForm
  if (!current) {
    throw new Error('missing review')
  }
  await expect(
    request({
      kind: 'row-form',
      action: { kind: 'run', rowKey: page.rowKey, reviewedTarget: current.reviewedTarget }
    })
  ).rejects.toThrow('viewer_modal_open')
  expect(api.automations.runExternalActionForOwner).not.toHaveBeenCalled()
  cleanup()
  mocks.state.activeModal = 'none'
  const readonly = await mount('external', false)
  const review = (await apply({ kind: 'row-form', action: { kind: 'get' } })).rowForm
  if (!review) {
    throw new Error('missing review')
  }
  expect(review.externalRows[0]?.ownerAllowsRun).toBe(false)
  await expect(
    request({
      kind: 'row-form',
      action: { kind: 'run', rowKey: readonly.rowKey, reviewedTarget: review.reviewedTarget }
    })
  ).rejects.toThrow('automation_row_action_unavailable')
})
it('retains the captured external dispatch and rejects owner changes without claiming cancellation', async () => {
  const page = await mount('external')
  let finish: (() => void) | undefined
  api.automations.runExternalActionForOwner.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const review = (await apply({ kind: 'row-form', action: { kind: 'get' } })).rowForm
  if (!review) {
    throw new Error('missing review')
  }
  const pending = request({
    kind: 'row-form',
    action: { kind: 'run', rowKey: page.rowKey, reviewedTarget: review.reviewedTarget }
  })
  void pending.catch(() => undefined)
  await waitFor(() => expect(api.automations.runExternalActionForOwner).toHaveBeenCalledTimes(1))
  act(() => {
    mocks.state.activeOrcaProfileId = 'other'
    page.redraw()
  })
  await expect(pending).rejects.toThrow('viewer_target_changed')
  await act(async () => {
    finish?.()
  })
  await settleHostQueries()
  expect(api.automations.runExternalActionForOwner).toHaveBeenCalledTimes(1)
  expect(api.automations.runExternalActionForOwner.mock.calls[0]?.[0]).toMatchObject({
    owner: { selector: { kind: 'ssh', targetId: 'ssh-test' } }
  })
})
