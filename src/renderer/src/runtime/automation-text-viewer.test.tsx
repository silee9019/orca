// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  applyAutomationText as apply,
  automationTextSnapshot as get,
  useAutomationTextViewer
} from './automation-text-viewer'
beforeEach(() => {
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
})
afterEach(cleanup)
const focused = () => true
function Harness({
  ownerKey = 'owner',
  focusName = focused
}: {
  ownerKey?: string
  focusName?: () => boolean
}) {
  useAutomationTextViewer({ ownerKey, focusName })
  return null
}
function token() {
  const state = get()
  if (!state) {
    throw new Error('missing text form')
  }
  return state.reviewedTarget
}
const focus = (reviewedTarget = token()) => apply({ kind: 'focus-name', reviewedTarget })
it('invalidates owner and profile ABA and enforces modal boundaries', async () => {
  const callback = vi.fn(() => true)
  const view = render(<Harness focusName={callback} />)
  const old = token()
  view.rerender(<Harness ownerKey="changed" focusName={callback} />)
  view.rerender(<Harness focusName={callback} />)
  await expect(focus(old)).rejects.toThrow('viewer_target_changed')
  const profile = token()
  act(() => useAppStore.setState({ activeOrcaProfileId: 'second' }))
  act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
  await expect(focus(profile)).rejects.toThrow('viewer_target_changed')
  act(() => useAppStore.setState({ activeModal: 'create-worktree' }))
  await expect(focus()).rejects.toThrow('viewer_modal_open')
  expect(callback).not.toHaveBeenCalled()
})
it('releases failed callbacks and requires actual DOM focus acknowledgement', async () => {
  const callback = vi.fn((): boolean => {
    throw new Error('fixture focus failure')
  })
  render(<Harness focusName={callback} />)
  await expect(focus()).rejects.toThrow('fixture focus failure')
  expect(get()?.busy).toBe(false)
  callback.mockReturnValue(false)
  await expect(focus()).rejects.toThrow('automation_name_focus_unavailable')
  callback.mockReturnValue(true)
  await expect(focus()).resolves.toMatchObject({ busy: false })
})
it('fences reentrant focus and refuses an owner changed inside the focus event', async () => {
  let reentrant: ReturnType<typeof apply> | undefined
  const callback = vi.fn(() => {
    reentrant = focus()
    void reentrant.catch(() => undefined)
    return true
  })
  const view = render(<Harness focusName={callback} />)
  await expect(focus()).resolves.toMatchObject({ busy: false })
  await expect(reentrant).rejects.toThrow('viewer_busy')
  callback.mockImplementation(() => {
    act(() => useAppStore.setState({ activeOrcaProfileId: 'changed' }))
    return true
  })
  await expect(focus()).rejects.toThrow('viewer_target_changed')
  callback.mockImplementation(() => {
    view.unmount()
    return true
  })
  await expect(focus()).rejects.toThrow('viewer_target_changed')
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
it('refuses ambiguous fields and exposes no snapshot after unmount', async () => {
  const view = render(
    <>
      <Harness />
      <Harness />
    </>
  )
  expect(get()).toBeNull()
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
  view.unmount()
  expect(get()).toBeNull()
})
