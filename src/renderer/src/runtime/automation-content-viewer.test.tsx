// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  applyAutomationContent as apply,
  automationContentSnapshot as get,
  useAutomationContentViewer
} from './automation-content-viewer'
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
})
afterEach(cleanup)
function Harness({
  hold = false,
  toggle = vi.fn(),
  replaceOwner = false
}: {
  hold?: boolean
  toggle?: () => void
  replaceOwner?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [owner, setOwner] = useState('ssh:1')
  useAutomationContentViewer({
    kind: 'prompt',
    ownerKey: owner,
    content: 'fixture',
    label: 'Prompt',
    expanded: open,
    canToggle: true,
    onToggle: () => {
      toggle()
      if (replaceOwner) {
        setOwner('ssh:2')
      }
      if (!hold) {
        setOpen((value) => !value)
      }
    }
  })
  return null
}
function token() {
  const state = get()[0]
  if (!state) {
    throw new Error('missing target')
  }
  return state.reviewedTarget
}
it('rejects duplicate pending operations and refuses an uncommitted toggle', async () => {
  render(<Harness hold />)
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(true, token())
    void pending.catch(() => undefined)
    await expect(apply(true, token())).rejects.toThrow('viewer_busy')
  })
  await expect(pending).rejects.toThrow('viewer_target_changed')
  expect(get()[0]?.busy).toBe(false)
})
it('releases a throwing toggle and allows retry and idempotent requested state', async () => {
  const toggle = vi.fn((): void => {
    throw new Error('fixture failure')
  })
  render(<Harness toggle={toggle} />)
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(true, token())
    void pending.catch(() => undefined)
  })
  await expect(pending).rejects.toThrow('fixture failure')
  expect(get()[0]?.busy).toBe(false)
  toggle.mockImplementation(() => undefined)
  await act(async () => {
    pending = apply(true, token())
  })
  expect((await pending)?.expanded).toBe(true)
  await expect(apply(true, token())).resolves.toMatchObject({ expanded: true })
  expect(toggle).toHaveBeenCalledTimes(2)
})
it('rejects a toggle whose owner changes during the callback', async () => {
  render(<Harness replaceOwner />)
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(true, token())
    void pending.catch(() => undefined)
  })
  await expect(pending).rejects.toThrow('viewer_target_changed')
})
it('rejects a request when the mounted target is removed before commit', async () => {
  const view = render(<Harness />)
  let pending: ReturnType<typeof apply> | undefined
  act(() => {
    pending = apply(true, token())
    void pending.catch(() => undefined)
    view.unmount()
  })
  await expect(pending).rejects.toThrow('viewer_unmounted')
})
