import { makeAutomation } from './automations-page-fixtures'
// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import {
  mocks,
  api,
  scopedList,
  installAutomationsPageHarness,
  settleHostQueries
} from './automations-page-test-harness'
import { AutomationViewerActionSchema } from '../../../../shared/automation-viewer-command'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
installAutomationsPageHarness()
afterEach(cleanup)
let apply: typeof applyAutomationViewerAction
async function request(action: Parameters<typeof apply>[0]) {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
async function destination(action: unknown) {
  const editor = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
  if (!editor) {
    throw new Error('missing editor')
  }
  return (
    await request(
      AutomationViewerActionSchema.parse({
        kind: 'editor-form',
        action: { kind: 'destination-form', reviewedTarget: editor.reviewedTarget, action }
      })
    )
  ).editorForm?.destination
}
async function mount(editing = false) {
  mocks.state.sshTargetLabels = new Map([['ssh-destination', 'SSH destination']])
  mocks.state.sshTargetGenerations = new Map([['ssh-destination', 1]])
  mocks.state.sshConnectionStates = new Map([['ssh-destination', { status: 'connected' }]])
  const rows = editing ? [makeAutomation()] : []
  scopedList(rows)
  api.automations.list.mockResolvedValue(rows)
  vi.resetModules()
  vi.doUnmock('./AutomationEditorDialog')
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  const view = render(<Page />)
  await settleHostQueries()
  if (editing) {
    const rowKey = (await apply({ kind: 'get' })).visibleRowKeys[0]
    if (!rowKey) {
      throw new Error('missing edit row')
    }
    await request({ kind: 'editor-edit', source: 'local', rowKey })
  } else {
    await request({ kind: 'editor-create' })
  }
  return { view, redraw: () => view.rerender(<Page />) }
}
it.each([false, true])(
  'uses actual Dialog Host selection and public CLI with editing=%s',
  async (editing) => {
    await mount(editing)
    const first = await destination({ kind: 'get' })
    const ssh = first?.hosts.find((host) => host.label === 'SSH destination')
    if (!first || !ssh?.eligible) {
      throw new Error('missing eligible SSH host')
    }
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Host' }))
    await user.click(screen.getByRole('option', { name: /SSH destination/ }))
    const native = await destination({ kind: 'get' })
    expect(native?.selectedStableKey).toBe(ssh.stableKey)
    const local = native?.hosts.find((host) => host.eligible && host.stableKey !== ssh.stableKey)
    if (!native || !local) {
      throw new Error('missing local destination')
    }
    const reset = await destination({
      kind: 'select',
      stableKey: local.stableKey,
      reviewedTarget: native.reviewedTarget
    })
    if (!reset) {
      throw new Error('missing destination')
    }
    const cli = await destination({
      kind: 'select',
      stableKey: ssh.stableKey,
      reviewedTarget: reset.reviewedTarget
    })
    expect(cli?.selectedStableKey).toBe(native.selectedStableKey)
    expect(cli?.projectIds).toEqual(native.projectIds)
    expect(api.automations.create).not.toHaveBeenCalled()
  }
)
it('rejects changed SSH generations and unloaded hosts without selecting a new owner', async () => {
  const { redraw } = await mount()
  const first = await destination({ kind: 'get' })
  const ssh = first?.hosts.find((host) => host.label === 'SSH destination')
  if (!first || !ssh) {
    throw new Error('missing SSH host')
  }
  mocks.state.sshTargetGenerations = new Map([['ssh-destination', 2]])
  redraw()
  await settleHostQueries()
  await expect(
    destination({ kind: 'select', stableKey: ssh.stableKey, reviewedTarget: first.reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
  const current = await destination({ kind: 'get' })
  if (!current) {
    throw new Error('missing destination')
  }
  await expect(
    destination({ kind: 'select', stableKey: 'foreign', reviewedTarget: current.reviewedTarget })
  ).rejects.toThrow('automation_destination_unavailable')
})
