import { makeWorktree } from '../components/automations/automations-page-fixtures'
import type { Worktree } from '../../../shared/worktree/types'
// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  applyAutomationWorkspaceViewerAction as apply,
  useAutomationWorkspaceViewerController
} from './automation-workspace-viewer-controller'
import {
  setAutomationWorkspaceDraft,
  setAutomationWorkspaceModeDraft
} from '../components/automations/automation-workspace-draft'
import type { AutomationDraft } from '../components/automations/AutomationEditorDialog'
import { AutomationWorkspaceViewerActionSchema } from '../../../shared/automation-workspace-viewer-command'

afterEach(cleanup)
const draft: AutomationDraft = {
  name: '',
  prompt: '',
  agentId: 'codex',
  projectId: 'repo-1',
  workspaceMode: 'existing',
  workspaceId: '',
  baseBranch: '',
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
const EMPTY_WORKTREES: readonly Worktree[] = []
function Field({
  projectId = 'repo-1',
  ownerKey = 'owner-1',
  worktrees = EMPTY_WORKTREES,
  onChange
}: {
  ownerKey?: string
  projectId?: string
  worktrees?: readonly Worktree[]
  onChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}) {
  useAutomationWorkspaceViewerController({
    draft: { ...draft, projectId },
    isHermesTarget: false,
    worktrees,
    ownerKey,
    selectWorkspace: (id) => onChange((current) => setAutomationWorkspaceDraft(current, id)),
    selectWorkspaceMode: (mode) =>
      onChange((current) => setAutomationWorkspaceModeDraft(current, mode))
  })
  return null
}
it('rejects held parent commits, replaced project scope, concurrent actions and unmounts', async () => {
  const changed = vi.fn()
  const view = render(<Field onChange={changed} />)
  const { reviewedTarget } = await apply({ kind: 'get' })
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({ kind: 'mode', reviewedTarget, value: 'new_per_run' })
    void request.catch(() => undefined)
    await expect(apply({ kind: 'mode', reviewedTarget, value: 'existing' })).rejects.toThrow(
      'viewer_busy'
    )
  })
  await expect(request).rejects.toThrow('viewer_target_changed')
  expect(changed).toHaveBeenCalledOnce()
  view.rerender(<Field projectId="repo-2" onChange={changed} />)
  await expect(apply({ kind: 'mode', reviewedTarget, value: 'new_per_run' })).rejects.toThrow(
    'viewer_target_changed'
  )
  const oldOwner = await apply({ kind: 'get' })
  view.rerender(
    <Field
      projectId="repo-2"
      worktrees={[makeWorktree({ runtimeOwnerEnvironmentId: 'host-next' })]}
      onChange={changed}
    />
  )
  await expect(
    apply({ kind: 'mode', reviewedTarget: oldOwner.reviewedTarget, value: 'new_per_run' })
  ).rejects.toThrow('viewer_target_changed')
  const oldIncarnation = await apply({ kind: 'get' })
  view.rerender(
    <Field
      projectId="repo-2"
      ownerKey="owner-next"
      worktrees={[makeWorktree({ runtimeOwnerEnvironmentId: 'host-next' })]}
      onChange={changed}
    />
  )
  await expect(
    apply({ kind: 'mode', reviewedTarget: oldIncarnation.reviewedTarget, value: 'new_per_run' })
  ).rejects.toThrow('viewer_target_changed')
  const current = await apply({ kind: 'get' })
  await act(async () => {
    request = apply({ kind: 'mode', reviewedTarget: current.reviewedTarget, value: 'new_per_run' })
    void request.catch(() => undefined)
    view.unmount()
  })
  await expect(request).rejects.toThrow('viewer_unmounted')
  await expect(apply({ kind: 'get' })).rejects.toThrow('automation_workspace_unavailable')
})
it('rejects ambiguous mounts and nonliteral modes or unknown action fields', async () => {
  render(
    <>
      <Field onChange={() => undefined} />
      <Field onChange={() => undefined} />
    </>
  )
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
  for (const action of [
    { kind: 'mode', reviewedTarget: '00000000-0000-4000-8000-000000000001', value: 'folder' },
    { kind: 'get', projectId: 'foreign' },
    { kind: 'select', reviewedTarget: 'not-a-token', workspaceId: 'workspace' }
  ]) {
    expect(AutomationWorkspaceViewerActionSchema.safeParse(action).success).toBe(false)
  }
})
