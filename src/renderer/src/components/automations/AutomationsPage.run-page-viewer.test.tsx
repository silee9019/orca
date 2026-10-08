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
import { makeRun, WORKSPACE_ID } from './automations-page-fixtures'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
import type { AppState } from '@/store'
import type { activateAndRevealWorktree } from '@/lib/worktree-activation'
vi.mock('@tanstack/react-virtual', async () => {
  const { createVirtualizerStub } = await import('./virtualizer-test-stub')
  return { useVirtualizer: createVirtualizerStub() }
})
installAutomationsPageHarness()
afterEach(cleanup)
let apply: typeof applyAutomationViewerAction
let activate: typeof activateAndRevealWorktree
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
async function mountRun(run = makeRun({ status: 'dispatch_failed' })) {
  api.automations.listRuns.mockResolvedValue([run])
  vi.resetModules()
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  activate = (await import('@/lib/worktree-activation')).activateAndRevealWorktree
  mocks.state.setSelectedAutomationId = (id: string | null) => {
    mocks.state.selectedAutomationId = id
  }
  mocks.state.setPendingAutomationRunNavigation = (
    value: AppState['pendingAutomationRunNavigation']
  ) => {
    mocks.state.pendingAutomationRunNavigation = value
  }
  const view = render(
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  await settleHostQueries()
  await expect(request({ kind: 'run-page-form', action: { kind: 'get' } })).rejects.toThrow(
    'viewer_unavailable'
  )
  await request({ kind: 'view', value: 'runs' })
  await settleHostQueries()
  await waitFor(async () => expect((await apply({ kind: 'get' })).runs?.loading).toBe(false))
  const runs = (await apply({ kind: 'get' })).runs
  if (!runs?.entries[0]) {
    throw new Error('missing run')
  }
  await request({
    kind: 'runs-open',
    entryKey: runs.entries[0].key,
    reviewedTarget: runs.reviewedTarget
  })
  await settleHostQueries()
  await waitFor(async () => expect((await apply({ kind: 'get' })).runPage?.runId).toBe(run.id))
  return view
}
async function reviewed() {
  const state = (await request({ kind: 'run-page-form', action: { kind: 'get' } })).runPageForm
  if (!state) {
    throw new Error('missing run page')
  }
  return state
}
it('uses the same actual Back button and reviewed root forwarding', async () => {
  await mountRun()
  const before = await reviewed()
  expect(before.origin).toBe('runs')
  fireEvent.click(screen.getByRole('button', { name: 'Back to runs' }))
  await settleHostQueries()
  expect((await apply({ kind: 'get' })).view).toBe('runs')
  const runs = (await apply({ kind: 'get' })).runs
  if (!runs?.entries[0]) {
    throw new Error('missing run')
  }
  await request({
    kind: 'runs-open',
    entryKey: runs.entries[0].key,
    reviewedTarget: runs.reviewedTarget
  })
  await settleHostQueries()
  const current = await reviewed()
  await expect(
    request({
      kind: 'run-page-form',
      action: { kind: 'back', reviewedTarget: before.reviewedTarget }
    })
  ).rejects.toThrow('viewer_target_changed')
  await expect(
    request({
      kind: 'run-page-form',
      action: { kind: 'back', reviewedTarget: current.reviewedTarget }
    })
  ).resolves.toMatchObject({
    view: 'runs',
    runPageForm: { closed: true, completed: { action: 'back' } }
  })
  await expect(request({ kind: 'run-page-form', action: { kind: 'get' } })).rejects.toThrow(
    'viewer_unavailable'
  )
})
it('reruns through the actual button and returns the provider acknowledgement through CLI', async () => {
  await mountRun()
  const before = await reviewed()
  expect(before.canRerun).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Rerun' }))
  await waitFor(() => expect(api.automations.runNow).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Rerun' }).hasAttribute('disabled')).toBe(false)
  )
  const uiArgs = api.automations.runNow.mock.calls[0]
  const current = await reviewed()
  const result = await request({
    kind: 'run-page-form',
    action: { kind: 'rerun', reviewedTarget: current.reviewedTarget }
  })
  expect(api.automations.runNow.mock.calls[1]).toEqual(uiArgs)
  expect(result.runPageForm?.completed?.mutation).toMatchObject({
    mutation: 'acknowledged',
    refresh: 'completed'
  })
})
it('preserves rerun acknowledgement when UI hydration fails and blocks unavailable workspace opens', async () => {
  await mountRun()
  const state = await reviewed()
  expect(state.canOpenWorkspace).toBe(false)
  await expect(
    request({
      kind: 'run-page-form',
      action: { kind: 'open-workspace', reviewedTarget: state.reviewedTarget }
    })
  ).rejects.toThrow('automation_run_action_unavailable')
  expect(activate).not.toHaveBeenCalled()
  api.ui.get.mockRejectedValueOnce(new Error('read failed'))
  const result = await request({
    kind: 'run-page-form',
    action: { kind: 'rerun', reviewedTarget: state.reviewedTarget }
  })
  expect(result.runPageForm?.completed?.mutation).toMatchObject({
    mutation: 'acknowledged',
    refresh: 'failed'
  })
})
it('opens the same host-qualified run workspace from the native button and CLI, and reports failed activation', async () => {
  await mountRun(makeRun({ workspaceId: WORKSPACE_ID }))
  vi.mocked(activate).mockReturnValue({ primaryTabId: null })
  const state = await reviewed()
  expect(state.canOpenWorkspace).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Resume workspace' }))
  expect(activate).toHaveBeenCalledExactlyOnceWith(WORKSPACE_ID)
  const result = await request({
    kind: 'run-page-form',
    action: { kind: 'open-workspace', reviewedTarget: state.reviewedTarget }
  })
  expect(activate).toHaveBeenCalledTimes(2)
  expect(result.runPageForm?.completed?.workspace).toEqual({
    status: 'opened',
    workspaceId: WORKSPACE_ID,
    tabId: null
  })
  vi.mocked(activate).mockReturnValue(false)
  const current = await reviewed()
  const refused = await request({
    kind: 'run-page-form',
    action: { kind: 'open-workspace', reviewedTarget: current.reviewedTarget }
  })
  expect(refused.runPageForm?.completed?.workspace).toEqual({ status: 'unavailable' })
})
