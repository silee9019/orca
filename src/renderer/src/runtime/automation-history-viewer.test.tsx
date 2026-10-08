// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { makeRun } from '../components/automations/automations-page-fixtures'
import {
  automationHistoryViewerSnapshot as snapshot,
  prepareAutomationHistoryViewerOpen as prepare,
  useAutomationHistoryViewer
} from './automation-history-viewer'
beforeEach(() => useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'profile' }))
afterEach(cleanup)
function form() {
  return {
    ownerKey: 'owner-a',
    automationId: 'automation',
    runs: [makeRun()],
    selectedRunId: null,
    unavailable: false,
    onSelect: vi.fn()
  }
}
function current() {
  const value = snapshot()
  if (!value) {
    throw new Error('missing history')
  }
  return value
}
it('requires the reviewed owner even when another host has the same automation and run IDs', () => {
  const input = form()
  const hook = renderHook((value) => useAutomationHistoryViewer(value), { initialProps: input })
  const before = current()
  hook.rerender({ ...input, ownerKey: 'owner-b' })
  hook.rerender(input)
  expect(() => prepare(input.runs[0].id, before.reviewedTarget)).toThrow('viewer_target_changed')
  const selected = prepare(input.runs[0].id, current().reviewedTarget)
  act(() => selected.open())
  expect(input.onSelect).toHaveBeenCalledExactlyOnceWith(input.runs[0])
  hook.unmount()
  expect(() => prepare(input.runs[0].id, before.reviewedTarget)).toThrow('viewer_unavailable')
})
it('rejects failed history reads, unscoped mounts and ambiguous histories', () => {
  const input = form()
  const hook = renderHook((value) => useAutomationHistoryViewer(value), { initialProps: input })
  hook.rerender({ ...input, unavailable: true })
  expect(() => prepare(input.runs[0].id, current().reviewedTarget)).toThrow(
    'automation_run_not_visible'
  )
  hook.unmount()
  const unscoped = renderHook(() => useAutomationHistoryViewer({ ...input, ownerKey: null }))
  expect(() => prepare(input.runs[0].id, current().reviewedTarget)).toThrow('viewer_unavailable')
  unscoped.unmount()
  renderHook(() => useAutomationHistoryViewer(input))
  renderHook(() => useAutomationHistoryViewer(input))
  expect(snapshot()).toBeNull()
  expect(() => prepare(input.runs[0].id, 'unused')).toThrow('viewer_ambiguous')
  expect(input.onSelect).not.toHaveBeenCalled()
})
