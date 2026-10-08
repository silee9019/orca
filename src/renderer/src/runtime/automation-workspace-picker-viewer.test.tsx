// @vitest-environment happy-dom
import { act, useRef, useState } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  applyAutomationWorkspacePicker as apply,
  automationWorkspacePickerSnapshot as get,
  useAutomationWorkspacePickerViewer
} from './automation-workspace-picker-viewer'
const DEFAULT_IDS = ['one', 'two']
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
  frames.clear()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function Harness({
  owner = 'ssh:1',
  ids = DEFAULT_IDS,
  focus = vi.fn()
}: {
  owner?: string
  ids?: string[]
  focus?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('one')
  const focused = useRef(false)
  useAutomationWorkspacePickerViewer({
    workspaceIds: ids,
    ownerKey: owner,
    value,
    open,
    onOpenChange: (next) => {
      setOpen(next)
      if (!next) {
        focused.current = false
      }
    },
    focusSearch: () => {
      focus()
      focused.current = true
    },
    searchFocused: () => focused.current,
    onSelect: (id) => {
      setValue(id)
      setOpen(false)
    }
  })
  return null
}
function token() {
  const state = get()
  if (!state) {
    throw new Error('missing picker')
  }
  return state.reviewedTarget
}
async function open() {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'open', value: true, reviewedTarget: token() })
  })
  return pending
}
async function focus() {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'focus', reviewedTarget: token() })
    void pending.catch(() => undefined)
  })
  return { pending }
}
function flushFrames() {
  act(() => {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback(0))
  })
}
it('keeps focus busy until its frame commits and refuses concurrent changes', async () => {
  render(<Harness />)
  await open()
  const { pending } = await focus()
  expect(get()?.busy).toBe(true)
  await expect(
    apply({ kind: 'select', workspaceId: 'two', reviewedTarget: token() })
  ).rejects.toThrow('viewer_busy')
  flushFrames()
  await expect(pending).resolves.toMatchObject({ open: true, searchFocused: true, busy: false })
})
it('rejects owner, worktree and profile ABA reviews and modals', async () => {
  const view = render(<Harness />)
  const first = token()
  view.rerender(<Harness owner="ssh:2" />)
  view.rerender(<Harness />)
  await expect(apply({ kind: 'open', value: true, reviewedTarget: first })).rejects.toThrow(
    'viewer_target_changed'
  )
  const ids = token()
  view.rerender(<Harness ids={['one']} />)
  view.rerender(<Harness />)
  await expect(apply({ kind: 'open', value: true, reviewedTarget: ids })).rejects.toThrow(
    'viewer_target_changed'
  )
  const profile = token()
  act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
  act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
  await expect(apply({ kind: 'open', value: true, reviewedTarget: profile })).rejects.toThrow(
    'viewer_target_changed'
  )
  act(() => useAppStore.setState({ activeModal: 'create-worktree' }))
  await expect(apply({ kind: 'open', value: true, reviewedTarget: token() })).rejects.toThrow(
    'viewer_modal_open'
  )
})
it('retains invalidation when a pending frame crosses an owner ABA', async () => {
  const view = render(<Harness />)
  await open()
  const { pending } = await focus()
  view.rerender(<Harness owner="ssh:2" />)
  view.rerender(<Harness />)
  flushFrames()
  await expect(pending).rejects.toThrow('viewer_target_changed')
})
it('cancels its pending frame on unmount and rejects closed or missing targets', async () => {
  const view = render(<Harness />)
  await expect(apply({ kind: 'focus', reviewedTarget: token() })).rejects.toThrow(
    'automation_workspace_picker_closed'
  )
  await open()
  const { pending } = await focus()
  expect(frames.size).toBe(1)
  view.unmount()
  expect(frames.size).toBe(0)
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await expect(apply({ kind: 'get' })).rejects.toThrow('automation_workspace_picker_unavailable')
})
it('releases a throwing focus callback for retry and refuses ambiguous mounted pickers', async () => {
  const callback = vi.fn((): void => {
    throw new Error('fixture failure')
  })
  const view = render(<Harness focus={callback} />)
  await open()
  const { pending } = await focus()
  await expect(pending).rejects.toThrow('fixture failure')
  expect(get()?.busy).toBe(false)
  callback.mockImplementation(() => undefined)
  const retry = await focus()
  flushFrames()
  await expect(retry.pending).resolves.toMatchObject({ searchFocused: true })
  view.unmount()
  render(
    <>
      <Harness />
      <Harness owner="ssh:2" />
    </>
  )
  expect(get()).toBeNull()
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
})
