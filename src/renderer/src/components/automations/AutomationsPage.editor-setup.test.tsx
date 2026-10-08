// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { api, mocks, installAutomationsPageHarness } from './automations-page-test-harness'
import { makeStoreState, REPO_ID } from './automations-page-fixtures'

vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
afterEach(cleanup)
installAutomationsPageHarness()
it('uses the actual Advanced setup disclosure and checkbox and rejects hidden controls', async () => {
  const fixtures = makeStoreState()
  const existing = fixtures.repoMap.get(REPO_ID)
  if (!existing) {
    throw new Error('missing project fixture')
  }
  const repo = {
    ...existing,
    hookSettings: {
      mode: 'override' as const,
      setupRunPolicy: 'run-by-default' as const,
      scripts: { setup: 'pnpm install', archive: '' }
    }
  }
  mocks.state.repos = [repo]
  mocks.repoMap.set(REPO_ID, repo)
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
    const form = (action: unknown) =>
      schema.parse({
        kind: 'editor-form',
        action: { kind: 'setup-form', reviewedTarget: editor.reviewedTarget, action }
      })
    const hidden = (await apply(form({ kind: 'get' }))).editorForm?.setup
    if (!hidden) {
      throw new Error('missing setup state')
    }
    expect(hidden.visible).toBe(false)
    await expect(
      apply(form({ kind: 'open', reviewedTarget: hidden.reviewedTarget, value: true }))
    ).rejects.toThrow('automation_setup_unavailable')
    const workspace = (
      await apply({
        kind: 'editor-form',
        action: {
          kind: 'workspace-form',
          reviewedTarget: editor.reviewedTarget,
          action: { kind: 'get' }
        }
      })
    ).editorForm?.workspace
    if (!workspace) {
      throw new Error('missing workspace')
    }
    await act(async () => {
      request = apply({
        kind: 'editor-form',
        action: {
          kind: 'workspace-form',
          reviewedTarget: editor.reviewedTarget,
          action: { kind: 'mode', reviewedTarget: workspace.reviewedTarget, value: 'new_per_run' }
        }
      })
    })
    await request
    const setup = (await apply(form({ kind: 'get' }))).editorForm?.setup
    if (!setup) {
      throw new Error('missing visible setup state')
    }
    expect(setup).toMatchObject({
      visible: true,
      open: false,
      defaultDecision: 'run',
      decision: 'run'
    })
    await expect(
      apply(form({ kind: 'open', reviewedTarget: hidden.reviewedTarget, value: true }))
    ).rejects.toThrow('viewer_target_changed')
    await expect(
      apply(form({ kind: 'decision', reviewedTarget: setup.reviewedTarget, value: 'skip' }))
    ).rejects.toThrow('automation_setup_control_unavailable')
    await act(async () => {
      request = apply(form({ kind: 'open', reviewedTarget: setup.reviewedTarget, value: true }))
    })
    await expect(request).resolves.toMatchObject({ editorForm: { setup: { open: true } } })
    const checkbox = screen.getByRole('checkbox', { name: 'Run setup for each new workspace' })
    expect(checkbox).toHaveProperty('checked', true)
    await act(async () => {
      request = apply(
        form({ kind: 'decision', reviewedTarget: setup.reviewedTarget, value: 'skip' })
      )
    })
    await expect(request).resolves.toMatchObject({
      editorForm: { draft: { setupDecision: 'skip' }, setup: { decision: 'skip' } }
    })
    expect(checkbox).toHaveProperty('checked', false)
    fireEvent.click(checkbox)
    expect(
      (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm?.draft
        .setupDecision
    ).toBe('run')
    await act(async () => {
      request = apply(form({ kind: 'open', reviewedTarget: setup.reviewedTarget, value: false }))
    })
    await request
    await expect(
      apply(form({ kind: 'decision', reviewedTarget: setup.reviewedTarget, value: 'skip' }))
    ).rejects.toThrow('automation_setup_control_unavailable')
    expect(api.automations.create).not.toHaveBeenCalled()
  } finally {
    view.unmount()
  }
})
