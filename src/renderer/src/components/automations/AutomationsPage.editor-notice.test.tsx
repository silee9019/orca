// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  installAutomationsPageHarness,
  mocks,
  runtimeHost,
  addRuntimeProject,
  RUNTIME_REPO_ID,
  RUNTIME_SELF_FILTER,
  settleHostQueries
} from './automations-page-test-harness'
import { makeAutomation } from './automations-page-fixtures'
import { listedRows } from './automations-page-listed-items'
import { AutomationOwnerConflictError } from '../../../../shared/automation-owner-conflict'

vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
afterEach(cleanup)
installAutomationsPageHarness()
it('dismisses an actual runtime save refusal through the public editor viewer and Page callback', async () => {
  runtimeHost([makeAutomation({ projectId: RUNTIME_REPO_ID, workspaceMode: 'new_per_run' })], [])
  addRuntimeProject()
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
    const original = mocks.callRuntimeRpc.getMockImplementation()
    mocks.callRuntimeRpc.mockImplementation(async (...args) => {
      if (args[1] === 'automation.update') {
        throw new AutomationOwnerConflictError('automation_owner_changed')
      }
      return original?.(...args)
    })
    const save = screen.getByRole('button', { name: 'Save Changes' })
    expect(save).toHaveProperty('disabled', false)
    fireEvent.click(save)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('host changed'))
    const editor = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
    if (!editor?.notice.value) {
      throw new Error('missing editor refusal')
    }
    expect(editor.notice.canDismiss).toBe(true)
    await act(async () => {
      pending = apply({
        kind: 'editor-form',
        action: {
          kind: 'notice-dismiss',
          reviewedTarget: editor.reviewedTarget,
          reviewedNotice: editor.notice.reviewedTarget
        }
      })
    })
    await expect(pending).resolves.toMatchObject({
      editorForm: { open: true, notice: { value: null, canDismiss: false } }
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(
      mocks.callRuntimeRpc.mock.calls.filter((call) => call[1] === 'automation.update')
    ).toHaveLength(1)
  } finally {
    view.unmount()
  }
})
