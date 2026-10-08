// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  applyAutomationRunPageViewer as apply,
  useAutomationRunPageViewer,
  isAutomationRunPageViewerBusy,
  type AutomationRunPageViewerForm as Form
} from './automation-run-page-viewer'
import type { AutomationMutationOutcome } from '../components/automations/automation-mutation-outcome'
afterEach(cleanup)
function form(): Form {
  return {
    enabled: true,
    ownerKey: 'profile/host-generation-1',
    targetKey: 'workspace-1',
    runId: 'run-1',
    rowKey: 'host/automation',
    origin: 'runs',
    modalOpen: false,
    canRerun: true,
    rerunPending: false,
    canOpenWorkspace: true,
    onBack: vi.fn(),
    onRerun: vi.fn<Form['onRerun']>(async () => ({
      mutation: 'acknowledged',
      refresh: 'completed',
      notice: null
    })),
    onOpenWorkspace: vi.fn<Form['onOpenWorkspace']>(() => ({
      status: 'opened',
      workspaceId: 'workspace-1',
      tabId: null
    }))
  }
}
async function request(action: Parameters<typeof apply>[0]) {
  let promise: ReturnType<typeof apply> | undefined
  await act(async () => {
    promise = apply(action)
    void promise.catch(() => undefined)
  })
  if (!promise) {
    throw new Error('missing promise')
  }
  return promise
}
it('guards unavailable, ambiguous, stale, modal and disabled run pages', async () => {
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
  const initial = form()
  const view = renderHook(({ value }) => useAutomationRunPageViewer(value), {
    initialProps: { value: initial }
  })
  const before = await apply({ kind: 'get' })
  const second = renderHook(() => useAutomationRunPageViewer(form()))
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
  second.unmount()
  view.rerender({ value: { ...initial, targetKey: 'workspace-2' } })
  await expect(
    request({ kind: 'open-workspace', reviewedTarget: before.reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
  view.rerender({ value: { ...initial, modalOpen: true } })
  const modal = await apply({ kind: 'get' })
  await expect(request({ kind: 'back', reviewedTarget: modal.reviewedTarget })).rejects.toThrow(
    'viewer_modal_open'
  )
  view.rerender({ value: { ...initial, canRerun: false, canOpenWorkspace: false } })
  const disabled = await apply({ kind: 'get' })
  await expect(request({ kind: 'rerun', reviewedTarget: disabled.reviewedTarget })).rejects.toThrow(
    'automation_run_action_unavailable'
  )
  await expect(
    request({ kind: 'open-workspace', reviewedTarget: disabled.reviewedTarget })
  ).rejects.toThrow('automation_run_action_unavailable')
  expect(initial.onRerun).not.toHaveBeenCalled()
  expect(initial.onOpenWorkspace).not.toHaveBeenCalled()
})
it('blocks competing actions and retains acknowledged mutation across owner or run ABA', async () => {
  let finish: ((outcome: AutomationMutationOutcome) => void) | undefined
  const initial = {
    ...form(),
    onRerun: () =>
      new Promise<AutomationMutationOutcome>((resolve) => {
        finish = resolve
      })
  }
  const view = renderHook(({ value }) => useAutomationRunPageViewer(value), {
    initialProps: { value: initial }
  })
  const before = await apply({ kind: 'get' })
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'rerun', reviewedTarget: before.reviewedTarget })
    void pending.catch(() => undefined)
  })
  expect((await apply({ kind: 'get' })).busy).toBe(true)
  view.rerender({ value: { ...initial, enabled: false } })
  expect(isAutomationRunPageViewerBusy()).toBe(true)
  view.rerender({ value: initial })
  await expect(request({ kind: 'back', reviewedTarget: before.reviewedTarget })).rejects.toThrow(
    'viewer_busy'
  )
  view.rerender({ value: { ...initial, ownerKey: 'replacement', runId: 'run-2' } })
  view.rerender({ value: initial })
  if (!finish) {
    throw new Error('not started')
  }
  const complete = finish
  await act(async () => complete({ mutation: 'acknowledged', refresh: 'failed', notice: null }))
  await expect(pending).resolves.toMatchObject({
    completed: {
      action: 'rerun',
      reviewStatus: 'changed',
      mutation: { mutation: 'acknowledged', refresh: 'failed' }
    }
  })
  await expect(request({ kind: 'rerun', reviewedTarget: before.reviewedTarget })).rejects.toThrow(
    'viewer_target_changed'
  )
})
it('reports callback failure and rejects pending rerun on unmount without a cancellation claim', async () => {
  const initial = form()
  initial.onRerun = vi.fn(async () => {
    throw new Error('provider failed')
  })
  const view = renderHook(({ value }) => useAutomationRunPageViewer(value), {
    initialProps: { value: initial }
  })
  const before = await apply({ kind: 'get' })
  await expect(request({ kind: 'rerun', reviewedTarget: before.reviewedTarget })).rejects.toThrow(
    'provider failed'
  )
  expect((await apply({ kind: 'get' })).busy).toBe(false)
  let finish: ((outcome: AutomationMutationOutcome) => void) | undefined
  view.rerender({
    value: {
      ...initial,
      onRerun: () =>
        new Promise((resolve) => {
          finish = resolve
        })
    }
  })
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'rerun', reviewedTarget: before.reviewedTarget })
    void pending.catch(() => undefined)
  })
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  if (!finish) {
    throw new Error('not started')
  }
  const complete = finish
  await act(async () => complete({ mutation: 'acknowledged', refresh: 'completed', notice: null }))
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
it('ignores inactive Orca mounts when an external run page is active', async () => {
  renderHook(() => useAutomationRunPageViewer({ ...form(), enabled: false }))
  const active = renderHook(() => useAutomationRunPageViewer({ ...form(), source: 'external' }))
  await expect(apply({ kind: 'get' })).resolves.toMatchObject({
    source: 'external',
    runId: 'run-1'
  })
  active.unmount()
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
