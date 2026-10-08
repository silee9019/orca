// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { api, mocks, installAutomationsPageHarness } from './automations-page-test-harness'
import { getDefaultSettings } from '../../../../shared/constants'

vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
afterEach(cleanup)
installAutomationsPageHarness()
it('selects the actual enabled agent and preserves the Hermes and current-disabled-agent rules', async () => {
  mocks.state.settings = { ...getDefaultSettings('/tmp'), disabledTuiAgents: ['claude'] }
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
    mocks.state.settings = {
      ...getDefaultSettings('/tmp'),
      disabledTuiAgents: ['claude', editor.draft.agentId]
    }
    view.rerender(<Page />)
    const updated = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
    expect(updated?.agentIds).toContain(editor.draft.agentId)
    expect(editor.agentIds).not.toContain('claude')
    expect(editor.agentIds).toContain(editor.draft.agentId)
    const agent = editor.agentIds.find((id) => id !== editor.draft.agentId)
    if (!agent) {
      throw new Error('missing enabled alternative agent')
    }
    const action = (value: string) =>
      schema.parse({
        kind: 'editor-form',
        action: { kind: 'agent', reviewedTarget: editor.reviewedTarget, value }
      })
    await expect(apply(action('claude'))).rejects.toThrow('automation_agent_unavailable')
    await act(async () => {
      request = apply(action(agent))
    })
    await expect(request).resolves.toMatchObject({ editorForm: { draft: { agentId: agent } } })
    expect(
      screen
        .getAllByRole('combobox')
        .some((element) => element.hasAttribute('data-agent-combobox-root'))
    ).toBe(true)
    await act(async () => {
      request = apply({
        kind: 'editor-form',
        action: { kind: 'create-target', reviewedTarget: editor.reviewedTarget, value: 'hermes' }
      })
    })
    await request
    await expect(apply(action(agent))).rejects.toThrow('automation_editor_control_unavailable')
    expect(api.automations.create).not.toHaveBeenCalled()
  } finally {
    view.unmount()
  }
})
