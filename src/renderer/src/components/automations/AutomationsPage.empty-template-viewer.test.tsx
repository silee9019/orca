// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  api,
  mocks,
  scopedList,
  installAutomationsPageHarness,
  settleHostQueries
} from './automations-page-test-harness'
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
async function editor() {
  const form = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
  if (!form) {
    throw new Error('missing editor')
  }
  return form
}
it('opens the actual empty list template and reaches the same draft through public CLI controls', async () => {
  scopedList([])
  api.automations.list.mockResolvedValue([])
  mocks.renderRealList = true
  vi.resetModules()
  vi.doUnmock('./AutomationEditorDialog')
  const [{ default: Page }, controller, { getAutomationTemplates }] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller'),
    import('./automation-templates')
  ])
  apply = controller.applyAutomationViewerAction
  render(<Page />)
  await settleHostQueries()
  expect((await apply({ kind: 'get' })).templates).toEqual(getAutomationTemplates())
  await expect(request({ kind: 'editor-create', templateId: 'missing-template' })).rejects.toThrow(
    'automation_template_unavailable'
  )
  expect((await apply({ kind: 'get' })).editor.open).toBe(false)
  for (const template of getAutomationTemplates()) {
    fireEvent.click(screen.getByText(template.label))
    const native = await editor()
    expect(native.name).toBe(template.name)
    expect(native.prompt).toBe(template.prompt)
    await request({
      kind: 'editor-form',
      action: { kind: 'close', reviewedTarget: native.reviewedTarget }
    })
    await request({ kind: 'editor-create', templateId: template.id })
    const cli = await editor()
    expect(cli.draft).toEqual(native.draft)
    expect(cli.templateOpen).toBe(false)
    await request({
      kind: 'editor-form',
      action: { kind: 'close', reviewedTarget: cli.reviewedTarget }
    })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Add new' }))
  const nativeBlank = await editor()
  await request({
    kind: 'editor-form',
    action: { kind: 'close', reviewedTarget: nativeBlank.reviewedTarget }
  })
  await request({ kind: 'editor-create' })
  expect((await editor()).draft).toEqual(nativeBlank.draft)
  expect(api.automations.create).not.toHaveBeenCalled()
  expect(api.automations.update).not.toHaveBeenCalled()
})
