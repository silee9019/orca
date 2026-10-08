// @vitest-environment happy-dom
import { act, useCallback, useState } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  applyLinearSkillPrompt as apply,
  useLinearSkillPromptViewer
} from './linear-skill-prompt-viewer'
const source = async () => undefined
const noop = () => undefined
function Harness({
  owner = 'local',
  refresh = source,
  commit = true,
  notify = noop,
  available = true
}: {
  owner?: string
  refresh?: () => Promise<void>
  commit?: boolean
  notify?: () => void
  available?: boolean
}) {
  const [open, setOpen] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const dismiss = useCallback(() => {
    notify()
    if (commit) {
      setOpen(false)
      setDismissed(true)
    }
  }, [commit, notify])
  const finish = useCallback(() => {
    notify()
    if (commit) {
      setOpen(false)
    }
  }, [commit, notify])
  useLinearSkillPromptViewer({
    promptKey: 'prompt',
    ownerKey: owner,
    source: refresh,
    open,
    dismissed,
    canDismiss: available,
    canFinish: available,
    dismiss,
    finish
  })
  return null
}
beforeEach(() => useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' }))
afterEach(cleanup)
async function target() {
  const state = (await apply({ kind: 'get' })).linearPrompts[0]
  if (!state) {
    throw new Error('missing prompt')
  }
  return state.reviewedTarget
}
async function start(kind: 'dismiss' | 'finish' = 'dismiss') {
  const reviewedTarget = await target()
  const pending = apply({ kind, promptKey: 'prompt', reviewedTarget })
  void pending.catch(noop)
  return { pending }
}
it.each(['dismiss', 'finish'] as const)('acknowledges the actual %s commit', async (kind) => {
  const notify = vi.fn()
  render(<Harness notify={notify} />)
  const { pending } = await start(kind)
  await act(async () => undefined)
  await expect(pending).resolves.toMatchObject({
    linearPrompts: [{ open: false, dismissed: kind === 'dismiss', busy: false }]
  })
  expect(notify).toHaveBeenCalledOnce()
})
it.each(['owner', 'profile', 'modal', 'source', 'callback', 'availability', 'unmount'] as const)(
  'rejects %s ABA before callback dispatch',
  async (change) => {
    const notify = vi.fn()
    const view = render(<Harness notify={notify} />)
    const reviewedTarget = await target()
    const pending = apply({ kind: 'dismiss', promptKey: 'prompt', reviewedTarget })
    void pending.catch(noop)
    if (change === 'owner') {
      view.rerender(<Harness owner="other" notify={notify} />)
      view.rerender(<Harness notify={notify} />)
    }
    if (change === 'profile') {
      act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
      act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
    }
    if (change === 'modal') {
      act(() => useAppStore.setState({ activeModal: 'add-repo' }))
      act(() => useAppStore.setState({ activeModal: 'none' }))
    }
    if (change === 'source') {
      view.rerender(<Harness refresh={async () => undefined} notify={notify} />)
      view.rerender(<Harness notify={notify} />)
    }
    if (change === 'callback') {
      view.rerender(<Harness notify={vi.fn()} />)
      view.rerender(<Harness notify={notify} />)
    }
    if (change === 'availability') {
      view.rerender(<Harness notify={notify} available={false} />)
      view.rerender(<Harness notify={notify} />)
    }
    if (change === 'unmount') {
      view.unmount()
    }
    await expect(pending).rejects.toThrow(/viewer_target_changed|viewer_unmounted/)
    expect(notify).not.toHaveBeenCalled()
  }
)
it('rejects a no-op instead of acknowledging a missing close/persistence commit', async () => {
  render(<Harness commit={false} />)
  const { pending } = await start()
  await act(async () => undefined)
  await expect(pending).rejects.toThrow('linear_prompt_not_committed')
})
it('releases callback failures and rejects concurrent writes', async () => {
  const notify = vi.fn().mockImplementationOnce(() => {
    throw new Error('storage denied')
  })
  render(<Harness notify={notify} />)
  const reviewedTarget = await target()
  const first = apply({ kind: 'dismiss', promptKey: 'prompt', reviewedTarget })
  void first.catch(noop)
  await expect(apply({ kind: 'finish', promptKey: 'prompt', reviewedTarget })).rejects.toThrow(
    'viewer_busy'
  )
  await expect(first).rejects.toThrow('storage denied')
  const retry = await start()
  await act(async () => undefined)
  await expect(retry.pending).resolves.toMatchObject({ linearPrompts: [{ dismissed: true }] })
  expect(notify).toHaveBeenCalledTimes(2)
})
it('requires an available unique mounted prompt and rejects blocking modals', async () => {
  const view = render(<Harness available={false} />)
  await expect((await start()).pending).rejects.toThrow('linear_prompt_action_unavailable')
  view.rerender(<Harness />)
  act(() => useAppStore.setState({ activeModal: 'add-repo' }))
  await expect((await start()).pending).rejects.toThrow('viewer_modal_open')
  view.unmount()
  await expect(
    apply({
      kind: 'dismiss',
      promptKey: 'prompt',
      reviewedTarget: '00000000-0000-4000-8000-000000000001'
    })
  ).rejects.toThrow('viewer_unavailable')
  render(
    <>
      <Harness />
      <Harness />
    </>
  )
  await expect((await start()).pending).rejects.toThrow('viewer_ambiguous')
})
