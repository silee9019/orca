// @vitest-environment happy-dom
import { act, useCallback, useState } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  applyOrchestrationCommandDialog as apply,
  useOrchestrationCommandDialogViewer
} from './orchestration-command-dialog-viewer'
function Harness({
  command = 'first',
  enabled = true,
  commit = true,
  callback
}: {
  command?: string
  enabled?: boolean
  commit?: boolean
  callback?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const change = useCallback(
    (value: boolean) => {
      callback?.(value)
      if (commit) {
        setOpen(value)
      }
    },
    [callback, commit]
  )
  useOrchestrationCommandDialogViewer({ command, open, canOpen: enabled, onOpenChange: change })
  return null
}
const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  'IS_REACT_ACT_ENVIRONMENT'
)
beforeEach(() => {
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    writable: true,
    value: true
  })
})
afterEach(() => {
  cleanup()
  if (originalActEnvironment) {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', originalActEnvironment)
  } else {
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  }
})
async function target() {
  return (await apply({ kind: 'get' })).commandDialog.reviewedTarget
}
async function request(open: boolean, reviewedTarget?: string) {
  return apply({ kind: 'set-open', open, reviewedTarget: reviewedTarget ?? (await target()) })
}
async function change(open: boolean) {
  let pending: ReturnType<typeof request> | undefined
  const reviewedTarget = await target()
  act(() => {
    pending = request(open, reviewedTarget)
    void pending.catch(() => undefined)
  })
  await act(async () => undefined)
  return pending
}
it('waits for actual open/close commits and refuses reentrant requests', async () => {
  const callback = vi.fn()
  render(<Harness callback={callback} />)
  const reviewedTarget = await target()
  let pending: ReturnType<typeof request> | undefined
  act(() => {
    pending = request(true, reviewedTarget)
    void pending.catch(() => undefined)
  })
  await expect(request(true, reviewedTarget)).rejects.toThrow('viewer_busy')
  await act(async () => undefined)
  await expect(pending).resolves.toMatchObject({ commandDialog: { open: true, busy: false } })
  await expect(change(false)).resolves.toMatchObject({ commandDialog: { open: false } })
  await expect(change(false)).resolves.toMatchObject({ commandDialog: { open: false } })
  expect(callback.mock.calls).toEqual([[true], [false]])
})
it.each(['command', 'profile', 'modal', 'permission', 'source', 'unmount'])(
  'invalidates %s changes before calling a captured setter',
  async (kind) => {
    const callback = vi.fn(),
      other = vi.fn()
    const view = render(<Harness callback={callback} />)
    const old = await target()
    const pending = request(true, old)
    void pending.catch(() => undefined)
    if (kind === 'command') {
      view.rerender(<Harness command="second" callback={callback} />)
      view.rerender(<Harness callback={callback} />)
    }
    if (kind === 'profile') {
      act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
      act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
    }
    if (kind === 'modal') {
      act(() => useAppStore.setState({ activeModal: 'create-worktree' }))
    }
    if (kind === 'permission') {
      view.rerender(<Harness enabled={false} callback={callback} />)
      view.rerender(<Harness callback={callback} />)
    }
    if (kind === 'source') {
      view.rerender(<Harness callback={other} />)
      view.rerender(<Harness callback={callback} />)
    }
    if (kind === 'unmount') {
      view.unmount()
    }
    await expect(pending).rejects.toThrow(
      kind === 'unmount' ? 'viewer_unmounted' : 'viewer_target_changed'
    )
    expect(callback).not.toHaveBeenCalled()
    expect(other).not.toHaveBeenCalled()
    if (kind === 'modal') {
      await expect(request(true)).rejects.toThrow('viewer_modal_open')
    }
  }
)
it('refuses disabled, missing and ambiguous dialogs and releases noop/throw failures', async () => {
  const view = render(<Harness enabled={false} />)
  await expect(request(true)).rejects.toThrow('skill_command_dialog_unavailable')
  view.rerender(<Harness commit={false} />)
  await expect(change(true)).rejects.toThrow('skill_command_dialog_not_committed')
  const callback = vi.fn(() => {
    throw new Error('fixture setter')
  })
  view.rerender(<Harness callback={callback} />)
  await expect(change(true)).rejects.toThrow('fixture setter')
  view.rerender(<Harness />)
  await expect(change(true)).resolves.toMatchObject({ commandDialog: { open: true, busy: false } })
  view.rerender(
    <>
      <Harness />
      <Harness />
    </>
  )
  await expect(target()).rejects.toThrow('viewer_ambiguous')
  view.unmount()
  await expect(target()).rejects.toThrow('viewer_unavailable')
})
