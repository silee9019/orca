// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { applyAgentSkillSetup as apply, useAgentSkillSetupViewer } from './agent-skill-setup-viewer'
const ready = async () => undefined
beforeEach(() => useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' }))
afterEach(cleanup)
function Harness({
  owner = 'local',
  recheck = ready,
  enabled = true,
  copy,
  open,
  terminal
}: {
  owner?: string
  recheck?: () => Promise<void>
  enabled?: boolean
  copy?: { target: string; run: () => Promise<boolean> }
  open?: (isCurrent: () => boolean) => Promise<boolean>
  terminal?: { open: boolean; attempt: number }
}) {
  useAgentSkillSetupViewer({
    panelKey: 'panel',
    title: 'Panel',
    ownerKey: owner,
    source: recheck,
    status: { installed: false, loading: false, error: null },
    canRecheck: enabled,
    recheck,
    copy,
    open,
    terminal
  })
  return null
}
async function token() {
  const panel = (await apply({ kind: 'get' })).setupPanels[0]
  if (!panel) {
    throw new Error('missing panel')
  }
  return panel.reviewedTarget
}
const request = async (reviewedTarget?: string) =>
  apply({ kind: 'recheck', panelKey: 'panel', reviewedTarget: reviewedTarget ?? (await token()) })
it.each(['owner', 'profile', 'modal', 'unmount'])(
  'cancels held rechecks across %s without accepting late results',
  async (change) => {
    let finish: (() => void) | undefined
    const recheck = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const view = render(<Harness recheck={recheck} />)
    const old = await token()
    const pending = request(old)
    void pending.catch(() => undefined)
    await act(async () => undefined)
    await expect(request()).rejects.toThrow('viewer_busy')
    if (change === 'owner') {
      view.rerender(<Harness owner="remote" recheck={recheck} />)
      view.rerender(<Harness recheck={recheck} />)
    }
    if (change === 'profile') {
      act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
      act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
    }
    if (change === 'modal') {
      act(() => useAppStore.setState({ activeModal: 'create-worktree' }))
    }
    if (change === 'unmount') {
      view.unmount()
    }
    await expect(pending).rejects.toThrow(
      change === 'unmount' ? 'viewer_unmounted' : 'viewer_target_changed'
    )
    await act(async () => {
      finish?.()
    })
    expect(recheck).toHaveBeenCalledOnce()
    if (change === 'owner' || change === 'profile') {
      await expect(request(old)).rejects.toThrow('viewer_target_changed')
    }
    if (change === 'modal') {
      await expect(request()).rejects.toThrow('viewer_modal_open')
    }
  }
)
it('releases provider failures and refuses disabled, unavailable and ambiguous panels', async () => {
  const recheck = vi.fn(async (): Promise<void> => {
    throw new Error('fixture refresh failure')
  })
  const view = render(<Harness recheck={recheck} />)
  await expect(request()).rejects.toThrow('fixture refresh failure')
  recheck.mockResolvedValue(undefined)
  await expect(request()).resolves.toMatchObject({ setupPanels: [{ busy: false }] })
  view.rerender(<Harness enabled={false} />)
  await expect(request()).rejects.toThrow('skill_setup_recheck_unavailable')
  view.rerender(
    <>
      <Harness />
      <Harness />
    </>
  )
  await expect(request()).rejects.toThrow('viewer_ambiguous')
  view.unmount()
  await expect(request('00000000-0000-4000-8000-000000000001')).rejects.toThrow(
    'viewer_unavailable'
  )
  expect((await apply({ kind: 'get' })).setupPanels).toEqual([])
})
it('does not call a different owner if it changes before the refresh microtask starts', async () => {
  const first = vi.fn(ready),
    second = vi.fn(ready)
  const view = render(<Harness recheck={first} />)
  const old = await token()
  const pending = apply({ kind: 'recheck', panelKey: 'panel', reviewedTarget: old })
  void pending.catch(() => undefined)
  view.rerender(<Harness owner="remote" recheck={second} />)
  await expect(pending).rejects.toThrow('viewer_target_changed')
  expect(first).not.toHaveBeenCalled()
  expect(second).not.toHaveBeenCalled()
})

it('invalidates unchanged display targets when their actual discovery callback changes and returns', async () => {
  const first = vi.fn(ready),
    second = vi.fn(ready)
  const view = render(<Harness recheck={first} />)
  const old = await token()
  view.rerender(<Harness recheck={second} />)
  view.rerender(<Harness recheck={first} />)
  await expect(request(old)).rejects.toThrow('viewer_target_changed')
  expect(first).not.toHaveBeenCalled()
  expect(second).not.toHaveBeenCalled()
})

it.each(['owner', 'profile', 'modal', 'source', 'terminal', 'unmount'])(
  'rejects held copies after %s changes and does not accept late clipboard results',
  async (change) => {
    let finish: ((copied: boolean) => void) | undefined
    const run = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        })
    )
    const copy = { target: 'attempt-1', run }
    const otherSource = async () => undefined
    const view = render(<Harness copy={copy} />)
    const old = await token()
    const requestCopy = (reviewedTarget: string) =>
      apply({ kind: 'copy-command', panelKey: 'panel', reviewedTarget })
    const pending = requestCopy(old)
    void pending.catch(() => undefined)
    await act(async () => undefined)
    await expect(requestCopy(old)).rejects.toThrow('viewer_busy')
    if (change === 'owner') {
      view.rerender(<Harness owner="remote" copy={copy} />)
      view.rerender(<Harness copy={copy} />)
    }
    if (change === 'profile') {
      act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
      act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
    }
    if (change === 'modal') {
      act(() => useAppStore.setState({ activeModal: 'create-worktree' }))
    }
    if (change === 'source') {
      view.rerender(<Harness recheck={otherSource} copy={copy} />)
      view.rerender(<Harness copy={copy} />)
    }
    if (change === 'terminal') {
      view.rerender(<Harness copy={{ target: 'attempt-2', run }} />)
      view.rerender(<Harness copy={copy} />)
    }
    if (change === 'unmount') {
      view.unmount()
    }
    await expect(pending).rejects.toThrow(
      change === 'unmount' ? 'viewer_unmounted' : 'viewer_target_changed'
    )
    await act(async () => finish?.(true))
    expect(run).toHaveBeenCalledOnce()
    if (change !== 'unmount') {
      await expect(requestCopy(old)).rejects.toThrow('viewer_target_changed')
    }
  }
)
it('checks copy targets again before invoking a captured clipboard callback', async () => {
  const run = vi.fn(async () => true)
  const view = render(<Harness copy={{ target: 'attempt-1', run }} />)
  const old = await token()
  const pending = apply({ kind: 'copy-command', panelKey: 'panel', reviewedTarget: old })
  void pending.catch(() => undefined)
  view.rerender(<Harness copy={{ target: 'attempt-2', run }} />)
  await expect(pending).rejects.toThrow('viewer_target_changed')
  expect(run).not.toHaveBeenCalled()
})

it('acknowledges opening only after the expected terminal attempt commits', async () => {
  const open = vi.fn(async () => true)
  const view = render(<Harness open={open} terminal={{ open: false, attempt: 0 }} />)
  const target = await token()
  const pending = apply({ kind: 'open-terminal', panelKey: 'panel', reviewedTarget: target })
  let acknowledged = false
  void pending.then(() => {
    acknowledged = true
  })
  await act(async () => undefined)
  expect(open).toHaveBeenCalledOnce()
  expect(acknowledged).toBe(false)
  view.rerender(<Harness open={open} terminal={{ open: true, attempt: 1 }} />)
  await expect(pending).resolves.toMatchObject({
    setupPanels: [{ terminalOpen: true, terminalAttempt: 1, busy: false }]
  })
})
it('rejects an unexpected terminal attempt and a changed owner before opening starts', async () => {
  const open = vi.fn(async () => true)
  const view = render(<Harness open={open} terminal={{ open: false, attempt: 0 }} />)
  const old = await token()
  const pending = apply({ kind: 'open-terminal', panelKey: 'panel', reviewedTarget: old })
  void pending.catch(() => undefined)
  await act(async () => undefined)
  view.rerender(<Harness open={open} terminal={{ open: true, attempt: 2 }} />)
  await expect(pending).rejects.toThrow('viewer_target_changed')
  const next = apply({ kind: 'open-terminal', panelKey: 'panel', reviewedTarget: await token() })
  void next.catch(() => undefined)
  view.rerender(<Harness owner="remote" open={open} />)
  await expect(next).rejects.toThrow('viewer_target_changed')
  expect(open).toHaveBeenCalledOnce()
})
