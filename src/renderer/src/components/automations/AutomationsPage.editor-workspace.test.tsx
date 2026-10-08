// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeWorktree, REPO_ID } from './automations-page-fixtures'
import { api, mocks, installAutomationsPageHarness } from './automations-page-test-harness'

vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
afterEach(cleanup)
installAutomationsPageHarness()

it('uses the rendered workspace choices and mode callback and refuses unavailable and stale controls', async () => {
  const primary = makeWorktree()
  const alternate = makeWorktree({
    id: 'workspace-alternate',
    path: '/repos/orca-alternate'
  })
  mocks.state.worktreesByRepo = { [REPO_ID]: [primary, alternate] }
  mocks.worktreeMap.set(alternate.id, alternate)
  vi.resetModules()
  vi.doUnmock('./AutomationEditorDialog')
  const [
    { default: Page },
    { applyAutomationViewerAction: apply },
    { AutomationViewerActionSchema: schema }
  ] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller'),
    import('../../../../shared/automation-viewer-command')
  ])
  const view = render(<Page />)
  try {
    let request: ReturnType<typeof apply> | undefined
    await act(async () => {
      request = apply({ kind: 'editor-create' })
    })
    await request
    const editor = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
    if (!editor) {
      throw new Error('missing editor')
    }
    const workspaceAction = (action: unknown) =>
      schema.parse({
        kind: 'editor-form',
        action: { kind: 'workspace-form', reviewedTarget: editor.reviewedTarget, action }
      })
    const workspace = (await apply(workspaceAction({ kind: 'get' }))).editorForm?.workspace
    if (!workspace || !workspace.workspaceIds[0]) {
      throw new Error('missing workspace choices')
    }
    await expect(
      apply(
        workspaceAction({
          kind: 'select',
          reviewedTarget: workspace.reviewedTarget,
          workspaceId: 'foreign-host-workspace'
        })
      )
    ).rejects.toThrow('automation_workspace_unavailable')
    await act(async () => {
      request = apply({
        kind: 'editor-form',
        action: { kind: 'session', reviewedTarget: editor.reviewedTarget, value: 'reuse' }
      })
    })
    await request
    await act(async () => {
      request = apply(
        workspaceAction({
          kind: 'mode',
          reviewedTarget: workspace.reviewedTarget,
          value: 'new_per_run'
        })
      )
    })
    await expect(request).resolves.toMatchObject({
      editorForm: {
        draft: { workspaceMode: 'new_per_run', reuseSession: false },
        workspace: { mode: 'new_per_run' }
      }
    })
    expect(screen.getByRole('radio', { name: 'New run' }).getAttribute('data-state')).toBe('on')
    await expect(
      apply(
        workspaceAction({
          kind: 'select',
          reviewedTarget: workspace.reviewedTarget,
          workspaceId: workspace.workspaceIds[0]
        })
      )
    ).rejects.toThrow('automation_workspace_control_unavailable')
    await act(async () => {
      request = apply(
        workspaceAction({
          kind: 'mode',
          reviewedTarget: workspace.reviewedTarget,
          value: 'existing'
        })
      )
    })
    await request
    await act(async () => {
      request = apply(
        workspaceAction({
          kind: 'select',
          reviewedTarget: workspace.reviewedTarget,
          workspaceId: alternate.id
        })
      )
    })
    await expect(request).resolves.toMatchObject({
      editorForm: { draft: { workspaceId: alternate.id } }
    })
    fireEvent.click(screen.getByRole('radio', { name: 'New run' }))
    expect(
      (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm?.draft
        .workspaceMode
    ).toBe('new_per_run')
    await act(async () => {
      request = apply({
        kind: 'editor-form',
        action: { kind: 'create-target', reviewedTarget: editor.reviewedTarget, value: 'hermes' }
      })
    })
    await request
    await expect(
      apply(
        workspaceAction({
          kind: 'mode',
          reviewedTarget: workspace.reviewedTarget,
          value: 'new_per_run'
        })
      )
    ).rejects.toThrow('viewer_target_changed')
    const hermes = (await apply(workspaceAction({ kind: 'get' }))).editorForm?.workspace
    if (!hermes) {
      throw new Error('missing Hermes workspace')
    }
    await expect(
      apply(
        workspaceAction({
          kind: 'mode',
          reviewedTarget: hermes.reviewedTarget,
          value: 'new_per_run'
        })
      )
    ).rejects.toThrow('automation_workspace_control_unavailable')
    await act(async () => {
      request = apply(
        workspaceAction({
          kind: 'select',
          reviewedTarget: hermes.reviewedTarget,
          workspaceId: hermes.workspaceIds[0]
        })
      )
    })
    await request
    expect(api.automations.create).not.toHaveBeenCalled()
  } finally {
    view.unmount()
  }
})
