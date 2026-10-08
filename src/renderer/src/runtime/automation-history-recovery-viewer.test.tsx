// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { AutomationActionNotice } from '../components/automations/automation-row-action-dispatch'
import {
  applyAutomationHistoryRecovery as apply,
  automationHistoryViewerSnapshot as snapshot,
  useAutomationHistoryViewer
} from './automation-history-viewer'
beforeEach(() => useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'profile' }))
afterEach(cleanup)
const notice: AutomationActionNotice = {
  message: 'History unavailable',
  recovery: 'retry',
  severity: 'failure'
}
function form() {
  return {
    ownerKey: 'owner-a',
    automationId: 'automation',
    runs: [],
    selectedRunId: null,
    unavailable: true,
    notice,
    onRecover: vi.fn(),
    onSelect: vi.fn()
  }
}
function current() {
  const state = snapshot()
  if (!state) {
    throw new Error('missing history')
  }
  return state
}
it('admits only the current offered recovery and blocks overlap until the callback commit', async () => {
  const input = form()
  renderHook(() => useAutomationHistoryViewer(input))
  await expect(apply('reconnect', current().reviewedTarget)).rejects.toThrow(
    'automation_history_recovery_unavailable'
  )
  let pending: ReturnType<typeof apply> | undefined
  let duplicate: ReturnType<typeof apply> | undefined
  act(() => {
    pending = apply('retry', current().reviewedTarget)
    duplicate = apply('retry', current().reviewedTarget)
    void duplicate.catch(() => undefined)
    expect(current().busy).toBe(true)
  })
  await expect(pending).resolves.toMatchObject({
    unavailable: true,
    busy: false,
    completed: { recoveryRequested: 'retry' }
  })
  await expect(duplicate).rejects.toThrow('viewer_busy')
  expect(input.onRecover).toHaveBeenCalledExactlyOnceWith('retry')
})
it('rejects stale replacement notices and fresh modal requests without dispatching', async () => {
  const input = form()
  const hook = renderHook((value) => useAutomationHistoryViewer(value), { initialProps: input })
  const before = current()
  hook.rerender({ ...input, notice: { ...notice } })
  await expect(apply('retry', before.reviewedTarget)).rejects.toThrow('viewer_target_changed')
  act(() => useAppStore.setState({ activeModal: 'worktree-palette' }))
  await expect(apply('retry', current().reviewedTarget)).rejects.toThrow('viewer_modal_open')
  expect(input.onRecover).not.toHaveBeenCalled()
})
it('rejects a callback commit under another owner and forwards callback failures', async () => {
  const input = form()
  let changeOwner: () => void = () => undefined
  input.onRecover.mockImplementation(() => changeOwner())
  const hook = renderHook((value) => useAutomationHistoryViewer(value), { initialProps: input })
  changeOwner = () => {
    hook.rerender({ ...input, ownerKey: 'owner-b' })
  }
  let pending: ReturnType<typeof apply> | undefined
  act(() => {
    pending = apply('retry', current().reviewedTarget)
    void pending.catch(() => undefined)
  })
  await expect(pending).rejects.toThrow('viewer_target_changed')
  input.onRecover.mockImplementation(() => {
    throw new Error('callback failed')
  })
  act(() => {
    pending = apply('retry', current().reviewedTarget)
    void pending.catch(() => undefined)
  })
  await expect(pending).rejects.toThrow('callback failed')
})
it('reports callback-requested closure and leaves unavailable host status explicit', async () => {
  const input = form()
  function Child({ close }: { close: () => void }) {
    useAutomationHistoryViewer({
      ...input,
      onRecover: () => {
        input.onRecover()
        close()
      }
    })
    return null
  }
  function Parent() {
    const [open, setOpen] = useState(true)
    return open ? <Child close={() => setOpen(false)} /> : null
  }
  render(<Parent />)
  let pending: ReturnType<typeof apply> | undefined
  act(() => {
    pending = apply('retry', current().reviewedTarget)
  })
  await expect(pending).resolves.toMatchObject({
    closed: true,
    unavailable: true,
    completed: { recoveryRequested: 'retry' }
  })
  expect(input.onRecover).toHaveBeenCalledTimes(1)
  expect(snapshot()).toBeNull()
})
