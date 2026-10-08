// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  applyAutomationWorkspaceViewerAction as apply,
  useAutomationWorkspaceViewerController
} from './automation-workspace-viewer-controller'
import type { AutomationDraft } from '../components/automations/AutomationEditorDialog'
const ready = async () => true
const noop = () => undefined
beforeEach(() => useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' }))
afterEach(cleanup)
function Harness({
  owner = 'owner',
  mode = 'new_per_run',
  branch,
  validate = ready,
  changed = noop,
  hold = false
}: {
  owner?: string
  mode?: 'existing' | 'new_per_run'
  branch?: string
  validate?: (value: string) => Promise<boolean>
  changed?: () => void
  hold?: boolean
}) {
  const [value, setValue] = useState('')
  const draft: AutomationDraft = {
    name: '',
    prompt: '',
    projectId: 'repo',
    agentId: 'codex',
    workspaceMode: mode,
    workspaceId: '',
    baseBranch: branch ?? value,
    reuseSession: false,
    precheckCommand: '',
    precheckTimeoutSeconds: '60',
    preset: 'daily',
    time: '09:00',
    dayOfWeek: '1',
    customSchedule: '',
    missedRunGraceMinutes: '720',
    savedSchedule: null,
    scheduleWarning: null
  }
  useAutomationWorkspaceViewerController({
    draft,
    isHermesTarget: false,
    worktrees: [],
    branchOwnerKey: owner,
    validateBaseBranch: validate,
    selectBaseBranch: (value) => {
      changed()
      if (!hold) {
        setValue(value)
      }
    },
    selectWorkspace: noop,
    selectWorkspaceMode: noop
  })
  return null
}
async function request(value = 'feature', reviewedTarget?: string) {
  const target = reviewedTarget ?? (await apply({ kind: 'get' })).reviewedTarget
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'base-branch', reviewedTarget: target, value })
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('missing branch request')
  }
  return { pending }
}
it.each(['owner', 'mode', 'branch', 'profile', 'modal', 'unmount'])(
  'cancels a held host search on %s before changing the draft',
  async (change) => {
    let finish: ((allowed: boolean) => void) | undefined
    const validate = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        })
    )
    const changed = vi.fn()
    const view = render(<Harness validate={validate} changed={changed} />)
    const first = (await apply({ kind: 'get' })).reviewedTarget
    const { pending } = await request()
    await expect((await request()).pending).rejects.toThrow('viewer_busy')
    if (change === 'owner') {
      view.rerender(<Harness owner="other" validate={validate} changed={changed} />)
      view.rerender(<Harness validate={validate} changed={changed} />)
    }
    if (change === 'mode') {
      view.rerender(<Harness mode="existing" validate={validate} changed={changed} />)
      view.rerender(<Harness validate={validate} changed={changed} />)
    }
    if (change === 'branch') {
      view.rerender(<Harness branch="native-change" validate={validate} changed={changed} />)
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
      finish?.(true)
    })
    expect(changed).not.toHaveBeenCalled()
    if (change === 'owner' || change === 'profile') {
      await expect((await request('feature', first)).pending).rejects.toThrow(
        'viewer_target_changed'
      )
    }
  }
)
it('releases failed provider reads and throwing callbacks and rejects missing commits', async () => {
  const validate = vi.fn(async (): Promise<boolean> => {
    throw new Error('ref search failed')
  })
  const changed = vi.fn((): void => {
    throw new Error('draft callback failed')
  })
  const view = render(<Harness validate={validate} changed={changed} />)
  await expect((await request()).pending).rejects.toThrow('ref search failed')
  validate.mockResolvedValue(false)
  await expect((await request()).pending).rejects.toThrow('automation_base_branch_unavailable')
  validate.mockResolvedValue(true)
  await expect((await request()).pending).rejects.toThrow('draft callback failed')
  changed.mockImplementation(noop)
  await expect((await request()).pending).resolves.toMatchObject({ baseBranch: 'feature' })
  view.rerender(<Harness validate={validate} changed={changed} hold />)
  await expect((await request('another')).pending).rejects.toThrow('viewer_target_changed')
})
