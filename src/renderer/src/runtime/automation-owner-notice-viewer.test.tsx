// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { AutomationsPageTopBar } from '../components/automations/AutomationsPageTopBar'
import type { AutomationActionNotice } from '../components/automations/automation-row-action-dispatch'
import {
  applyAutomationOwnerNotice as apply,
  automationOwnerNoticeSnapshot as get
} from './automation-owner-notice-viewer'
const first: AutomationActionNotice = {
  message: 'SSH host unavailable',
  severity: 'failure',
  recovery: 'reconnect'
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
})
afterEach(cleanup)
function Harness({
  notice = first,
  owner = 'ssh:1',
  hold = false,
  recover = vi.fn()
}: {
  notice?: AutomationActionNotice | null
  owner?: string
  hold?: boolean
  recover?: (action: string) => void
}) {
  const [cleared, setCleared] = useState(false)
  return (
    <AutomationsPageTopBar
      pageView="automations"
      isDetailOpen={false}
      runPageOrigin="runs"
      ownerNotice={cleared ? null : notice}
      ownerNoticeKey={owner}
      recoverOwnerAction={(action) => {
        recover(action)
        if (!hold) {
          setCleared(true)
        }
      }}
      dismissOwnerAction={() => {
        if (!hold) {
          setCleared(true)
        }
      }}
      showAutomationsList={() => undefined}
      showRunsDashboard={() => undefined}
      showAutomationDetails={() => undefined}
    />
  )
}
function review() {
  const state = get()
  if (!state) {
    throw new Error('missing viewer')
  }
  return state.reviewedTarget
}
async function request(action: Parameters<typeof apply>[0], token = review()) {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action, token)
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
it('dispatches native and CLI recovery to the same captured host callback', async () => {
  const recover = vi.fn()
  const native = render(<Harness recover={recover} />)
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
  expect(recover).toHaveBeenCalledExactlyOnceWith('reconnect')
  native.unmount()
  render(<Harness recover={recover} />)
  const state = await request({ kind: 'recover', action: 'reconnect' })
  expect(state).toMatchObject({
    notice: null,
    busy: false,
    completed: { requested: 'reconnect', reviewStatus: 'current' }
  })
  expect(recover).toHaveBeenCalledTimes(2)
})
it('rotates review on profile ABA, owner and identical notice replacement and blocks modals', async () => {
  const view = render(<Harness />)
  const old = review()
  act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
  act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
  await expect(request({ kind: 'dismiss' }, old)).rejects.toThrow('viewer_target_changed')
  const owner = review()
  view.rerender(<Harness owner="ssh:2" />)
  await expect(request({ kind: 'dismiss' }, owner)).rejects.toThrow('viewer_target_changed')
  const identity = review()
  view.rerender(<Harness owner="ssh:2" notice={{ ...first }} />)
  await expect(request({ kind: 'dismiss' }, identity)).rejects.toThrow('viewer_target_changed')
  act(() => useAppStore.setState({ activeModal: 'create-worktree' }))
  await expect(request({ kind: 'dismiss' })).rejects.toThrow('viewer_modal_open')
})
it('keeps a held recovery busy and rejects replaced notice or unmount', async () => {
  const view = render(<Harness hold />)
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'recover', action: 'reconnect' }, review())
    void pending.catch(() => undefined)
  })
  expect(get()?.busy).toBe(true)
  await expect(request({ kind: 'dismiss' })).rejects.toThrow('viewer_busy')
  view.rerender(<Harness hold notice={{ ...first }} />)
  await expect(pending).rejects.toThrow('viewer_target_changed')
  await act(async () => {
    pending = apply({ kind: 'dismiss' }, review())
    void pending.catch(() => undefined)
  })
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await expect(apply({ kind: 'dismiss' }, 'unused')).rejects.toThrow('viewer_unavailable')
})
it('rejects unsupported recovery and releases a throwing callback for retry', async () => {
  const recover = vi.fn((): void => {
    throw new Error('fixture failure')
  })
  render(<Harness recover={recover} />)
  await expect(request({ kind: 'recover', action: 'retry' })).rejects.toThrow(
    'automation_notice_unavailable'
  )
  await expect(request({ kind: 'recover', action: 'reconnect' })).rejects.toThrow('fixture failure')
  expect(get()?.busy).toBe(false)
  recover.mockImplementation(() => undefined)
  expect((await request({ kind: 'recover', action: 'reconnect' })).completed?.requested).toBe(
    'reconnect'
  )
})
it('rejects ambiguous mounted notices', async () => {
  render(
    <>
      <Harness />
      <Harness owner="ssh:2" />
    </>
  )
  expect(get()).toBeNull()
  await expect(apply({ kind: 'dismiss' }, 'unused')).rejects.toThrow('viewer_ambiguous')
})
