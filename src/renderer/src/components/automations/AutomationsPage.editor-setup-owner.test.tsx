// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  installAutomationsPageHarness,
  mocks,
  runtimeHost,
  addRuntimeProject,
  RUNTIME_REPO_ID,
  RUNTIME_ID,
  RUNTIME_SELF_FILTER,
  settleHostQueries
} from './automations-page-test-harness'
import { makeAutomation, makeStoreState, REPO_ID } from './automations-page-fixtures'
import { listedRows } from './automations-page-listed-items'

vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
afterEach(cleanup)
installAutomationsPageHarness()
it('invalidates the actual setup checkbox review when its runtime destination is paired again', async () => {
  runtimeHost([makeAutomation({ projectId: RUNTIME_REPO_ID, workspaceMode: 'new_per_run' })], [])
  addRuntimeProject()
  const runtimeRepo = mocks.repoMap.get(RUNTIME_REPO_ID)
  const nativeRepo = makeStoreState().repoMap.get(REPO_ID)
  if (!runtimeRepo || !nativeRepo) {
    throw new Error('missing projects')
  }
  const repo = {
    ...runtimeRepo,
    hookSettings: {
      mode: 'override' as const,
      setupRunPolicy: 'run-by-default' as const,
      scripts: { setup: 'pnpm install', archive: '' }
    }
  }
  mocks.state.repos = [nativeRepo, repo]
  mocks.repoMap.set(RUNTIME_REPO_ID, repo)
  mocks.state.automationHostFilter = RUNTIME_SELF_FILTER
  vi.resetModules()
  vi.doUnmock('./AutomationEditorDialog')
  const [{ default: Page }, { applyAutomationViewerAction: apply }] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  const view = render(<Page />)
  try {
    await settleHostQueries()
    const row = listedRows()[0]
    if (!row) {
      throw new Error('missing runtime row')
    }
    let pending: ReturnType<typeof apply> | undefined
    await act(async () => {
      pending = apply({ kind: 'editor-edit', source: 'local', rowKey: row.key })
    })
    await pending
    const editor = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
    if (!editor) {
      throw new Error('missing editor')
    }
    const reviewedTarget = editor.reviewedTarget
    const setup = (
      await apply({
        kind: 'editor-form',
        action: { kind: 'setup-form', reviewedTarget, action: { kind: 'get' } }
      })
    ).editorForm?.setup
    if (!setup?.visible) {
      throw new Error('missing visible runtime setup')
    }
    const setupTarget = setup.reviewedTarget
    await act(async () => {
      pending = apply({
        kind: 'editor-form',
        action: {
          kind: 'setup-form',
          reviewedTarget,
          action: { kind: 'open', reviewedTarget: setupTarget, value: true }
        }
      })
    })
    await pending
    mocks.state.runtimeEnvironments = [
      { id: RUNTIME_ID, name: 'GPU box', createdAt: 1, pairingRevision: 9 }
    ]
    view.rerender(<Page />)
    await settleHostQueries()
    const after = (
      await apply({
        kind: 'editor-form',
        action: { kind: 'setup-form', reviewedTarget, action: { kind: 'get' } }
      })
    ).editorForm?.setup
    expect(after?.reviewedTarget).not.toBe(setupTarget)
    await expect(
      apply({
        kind: 'editor-form',
        action: {
          kind: 'setup-form',
          reviewedTarget,
          action: { kind: 'decision', reviewedTarget: setupTarget, value: 'skip' }
        }
      })
    ).rejects.toThrow('viewer_target_changed')
  } finally {
    view.unmount()
  }
})
