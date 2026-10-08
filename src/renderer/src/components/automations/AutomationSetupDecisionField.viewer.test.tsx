// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AutomationSetupDecisionField } from './AutomationSetupDecisionField'
import { applyAutomationSetupViewerAction as apply } from '../../runtime/automation-setup-viewer-controller'
import type { AutomationDraft } from './AutomationEditorDialog'
import { makeStoreState, REPO_ID } from './automations-page-fixtures'

afterEach(cleanup)
const draft: AutomationDraft = {
  name: '',
  prompt: '',
  agentId: 'codex',
  projectId: REPO_ID,
  workspaceMode: 'new_per_run',
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
const existing = makeStoreState().repoMap.get(REPO_ID)
if (!existing) {
  throw new Error('missing fixture')
}
const repos = [
  {
    ...existing,
    hookSettings: {
      mode: 'override' as const,
      setupRunPolicy: 'run-by-default' as const,
      scripts: { setup: 'pnpm install', archive: '' }
    }
  }
]
it('calls touched before the real draft callback and fences held commits, owner changes and unmounts', async () => {
  const calls: string[] = []
  const props = {
    createTarget: 'orca' as const,
    draft,
    repos,
    projectHostSetups: [],
    yamlHooks: null,
    onDraftChange: vi.fn(() => {
      calls.push('draft')
    }),
    onSetupDecisionTouched: () => {
      calls.push('touched')
    }
  }
  const view = render(<AutomationSetupDecisionField {...props} ownerKey="owner-1" />)
  const { reviewedTarget } = await apply({ kind: 'get' })
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({ kind: 'open', reviewedTarget, value: true })
  })
  await request
  await act(async () => {
    request = apply({ kind: 'decision', reviewedTarget, value: 'skip' })
    void request.catch(() => undefined)
    await expect(apply({ kind: 'open', reviewedTarget, value: false })).rejects.toThrow(
      'viewer_busy'
    )
  })
  await expect(request).rejects.toThrow('viewer_target_changed')
  expect(calls).toEqual(['touched', 'draft'])
  view.rerender(<AutomationSetupDecisionField {...props} ownerKey="owner-2" />)
  await expect(apply({ kind: 'open', reviewedTarget, value: false })).rejects.toThrow(
    'viewer_target_changed'
  )
  const current = await apply({ kind: 'get' })
  await act(async () => {
    request = apply({ kind: 'open', reviewedTarget: current.reviewedTarget, value: false })
    void request.catch(() => undefined)
    view.unmount()
  })
  await expect(request).rejects.toThrow('viewer_unmounted')
  await expect(apply({ kind: 'get' })).rejects.toThrow('automation_setup_unavailable')
})
