// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { api, installAutomationsPageHarness } from './automations-page-test-harness'

vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: ({
    value,
    onChange,
    ariaLabel
  }: {
    value: string
    onChange: (value: string) => void
    ariaLabel: string
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
  getAutomationPromptEditorRoot: () => null
}))

afterEach(cleanup)
installAutomationsPageHarness()

it('routes public form actions through the real Page, Dialog and existing draft/close callbacks', async () => {
  vi.resetModules()
  vi.doUnmock('./AutomationEditorDialog')
  const [{ default: Page }, { applyAutomationViewerAction: apply }] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  render(<Page />)
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({ kind: 'editor-create' })
  })
  await expect(request).resolves.toMatchObject({ editor: { open: true } })
  const state = await apply({ kind: 'editor-form', action: { kind: 'get' } })
  const reviewedTarget = state.editorForm?.reviewedTarget
  if (!reviewedTarget) {
    throw new Error('missing rendered editor token')
  }
  await act(async () => {
    request = apply({
      kind: 'editor-form',
      action: { kind: 'name', reviewedTarget, value: '실제 페이지' }
    })
  })
  await expect(request).resolves.toMatchObject({ editorForm: { name: '실제 페이지' } })
  expect(screen.getByRole('textbox', { name: 'Automation name' })).toHaveProperty(
    'value',
    '실제 페이지'
  )
  await act(async () => {
    request = apply({
      kind: 'editor-form',
      action: { kind: 'prompt', reviewedTarget, value: '기존 draft를 갱신합니다.' }
    })
  })
  await expect(request).resolves.toMatchObject({
    editorForm: { prompt: '기존 draft를 갱신합니다.' }
  })
  expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveProperty(
    'value',
    '기존 draft를 갱신합니다.'
  )
  await act(async () => {
    request = apply({ kind: 'editor-form', action: { kind: 'close', reviewedTarget } })
  })
  await expect(request).resolves.toMatchObject({
    editor: { open: false },
    modalOpen: false,
    editorForm: { open: false }
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(api.automations.create).not.toHaveBeenCalled()
  expect(api.automations.update).not.toHaveBeenCalled()
})

it('uses the real Header template popover and target callback to commit the existing draft changes', async () => {
  vi.resetModules()
  vi.doUnmock('./AutomationEditorDialog')
  const [
    { default: Page },
    { applyAutomationViewerAction: apply },
    { AutomationViewerActionSchema: schema },
    { getAutomationTemplates }
  ] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller'),
    import('../../../../shared/automation-viewer-command'),
    import('./automation-templates')
  ])
  const view = render(<Page />)
  try {
    let request: ReturnType<typeof apply> | undefined
    await act(async () => {
      request = apply({ kind: 'editor-create' })
    })
    await request
    const reviewedTarget = (await apply({ kind: 'editor-form', action: { kind: 'get' } }))
      .editorForm?.reviewedTarget
    const template = getAutomationTemplates()[0]
    if (!reviewedTarget || !template) {
      throw new Error('missing editor/template fixture')
    }
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'template-open', reviewedTarget, value: true }
        })
      )
    })
    await expect(request).resolves.toMatchObject({ editorForm: { templateOpen: true } })
    expect(screen.getByText(template.description)).toBeTruthy()
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'template-apply', reviewedTarget, templateId: template.id }
        })
      )
    })
    await expect(request).resolves.toMatchObject({
      editorForm: {
        templateOpen: false,
        name: template.name,
        prompt: template.prompt,
        draft: {
          preset: template.preset,
          time: template.time,
          missedRunGraceMinutes: template.missedRunGraceMinutes
        }
      }
    })
    expect(screen.queryByText(template.description)).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Automation name' })).toHaveProperty(
      'value',
      template.name
    )
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'create-target', reviewedTarget, value: 'hermes' }
        })
      )
    })
    await expect(request).resolves.toMatchObject({
      editorForm: {
        createTarget: 'hermes',
        draft: { agentId: 'hermes', workspaceMode: 'existing', reuseSession: false }
      }
    })
    expect(screen.getByRole('radio', { name: 'Hermes' }).getAttribute('data-state')).toBe('on')
    expect(api.automations.create).not.toHaveBeenCalled()
    expect(api.automations.createExternalForOwner).not.toHaveBeenCalled()
  } finally {
    view.unmount()
  }
})

it('commits the existing session, grace and precheck fields and rejects hidden Hermes-create controls', async () => {
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
    const reviewedTarget = (await apply({ kind: 'editor-form', action: { kind: 'get' } }))
      .editorForm?.reviewedTarget
    if (!reviewedTarget) {
      throw new Error('missing editor token')
    }
    for (const [action, draft] of [
      [
        { kind: 'session', value: 'reuse' },
        { reuseSession: true, workspaceMode: 'existing' }
      ],
      [{ kind: 'session', value: 'fresh' }, { reuseSession: false }],
      [{ kind: 'missed-run-grace', value: '720' }, { missedRunGraceMinutes: '720' }],
      [
        { kind: 'precheck-command', value: 'git status --short' },
        { precheckCommand: 'git status --short' }
      ],
      [{ kind: 'precheck-timeout', value: '300' }, { precheckTimeoutSeconds: '300' }]
    ]) {
      await act(async () => {
        request = apply(
          schema.parse({ kind: 'editor-form', action: { ...action, reviewedTarget } })
        )
      })
      await expect(request).resolves.toMatchObject({ editorForm: { draft } })
    }
    expect(screen.getByRole('radio', { name: 'Fresh' }).getAttribute('data-state')).toBe('on')
    expect(screen.getByDisplayValue('git status --short')).toBeTruthy()
    expect(screen.getByText('12 hours')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Timeout' }).textContent).toBe('5 min')
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'create-target', value: 'hermes', reviewedTarget }
        })
      )
    })
    await request
    for (const action of [
      { kind: 'session', value: 'reuse' },
      { kind: 'missed-run-grace', value: '720' },
      { kind: 'precheck-command', value: 'hidden' },
      { kind: 'precheck-timeout', value: '300' }
    ]) {
      await expect(
        apply(schema.parse({ kind: 'editor-form', action: { ...action, reviewedTarget } }))
      ).rejects.toThrow('automation_editor_control_unavailable')
    }
    expect(api.automations.create).not.toHaveBeenCalled()
  } finally {
    view.unmount()
  }
})
