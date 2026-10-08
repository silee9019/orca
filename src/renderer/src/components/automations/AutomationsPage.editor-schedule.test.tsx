// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { api, installAutomationsPageHarness } from './automations-page-test-harness'

vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
afterEach(cleanup)
installAutomationsPageHarness()

it('uses the real schedule fields and preserves invalid intermediate cron input without saving', async () => {
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
    await expect(
      apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'schedule-weekday', reviewedTarget, value: '3' }
        })
      )
    ).rejects.toThrow('automation_editor_control_unavailable')
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'schedule-preset', reviewedTarget, value: 'weekly' }
        })
      )
    })
    await expect(request).resolves.toMatchObject({
      editorForm: { draft: { preset: 'weekly', scheduleWarning: null } }
    })
    expect(screen.getByRole('combobox', { name: 'Cadence' }).textContent).toBe('Weekly')
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'schedule-weekday', reviewedTarget, value: '3' }
        })
      )
    })
    await expect(request).resolves.toMatchObject({
      editorForm: { draft: { dayOfWeek: '3', scheduleWarning: null } }
    })
    expect(screen.getByText('Wednesday')).toBeTruthy()
    await expect(
      apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'schedule-cron', reviewedTarget, value: '*' }
        })
      )
    ).rejects.toThrow('automation_editor_control_unavailable')
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'schedule-preset', reviewedTarget, value: 'custom' }
        })
      )
    })
    await expect(request).resolves.toMatchObject({ editorForm: { draft: { preset: 'custom' } } })
    expect(screen.getByPlaceholderText('0 9 * * 1-5')).toHaveProperty('value', '0 9 * * 3')
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'schedule-cron', reviewedTarget, value: '*' }
        })
      )
    })
    await expect(request).resolves.toMatchObject({
      editorForm: { draft: { customSchedule: '*', scheduleWarning: null } }
    })
    expect(screen.getByPlaceholderText('0 9 * * 1-5').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Enter a valid five-field cron before saving.')).toBeTruthy()
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'schedule-cron', reviewedTarget, value: '15 10 * * 1-5' }
        })
      )
    })
    await expect(request).resolves.toMatchObject({
      editorForm: { draft: { customSchedule: '15 10 * * 1-5' } }
    })
    expect(screen.getByPlaceholderText('0 9 * * 1-5').getAttribute('aria-invalid')).toBe('false')
    expect(api.automations.create).not.toHaveBeenCalled()
    expect(api.automations.update).not.toHaveBeenCalled()
  } finally {
    view.unmount()
  }
})

it('commits time through the actual Page and digit field and fences custom cadence and remounts', async () => {
  vi.resetModules()
  vi.doUnmock('./AutomationEditorDialog')
  const [{ default: Page }, { applyAutomationViewerAction: apply }] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
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
    const time = (
      await apply({
        kind: 'editor-form',
        action: { kind: 'time-form', reviewedTarget, action: { kind: 'get' } }
      })
    ).editorForm?.time
    if (!time) {
      throw new Error('missing rendered time control')
    }
    await act(async () => {
      request = apply({
        kind: 'editor-form',
        action: {
          kind: 'time-form',
          reviewedTarget,
          action: {
            kind: 'input',
            reviewedTarget: time.reviewedTarget,
            field: 'minute',
            value: '12'
          }
        }
      })
    })
    await expect(request).resolves.toMatchObject({
      editorForm: {
        draft: { time: '09:12' },
        time: { time: '09:12', minute: { text: '12', value: 12 } }
      }
    })
    expect(screen.getByLabelText('Minute')).toHaveProperty('value', '12')
    await act(async () => {
      request = apply({
        kind: 'editor-form',
        action: { kind: 'schedule-preset', reviewedTarget, value: 'custom' }
      })
    })
    await request
    await expect(
      apply({
        kind: 'editor-form',
        action: { kind: 'time-form', reviewedTarget, action: { kind: 'get' } }
      })
    ).rejects.toThrow('automation_time_unavailable')
    expect(screen.queryByLabelText('Minute')).toBeNull()
    await act(async () => {
      request = apply({
        kind: 'editor-form',
        action: { kind: 'schedule-preset', reviewedTarget, value: 'daily' }
      })
    })
    await request
    await expect(
      apply({
        kind: 'editor-form',
        action: {
          kind: 'time-form',
          reviewedTarget,
          action: { kind: 'step', reviewedTarget: time.reviewedTarget, field: 'minute', delta: 1 }
        }
      })
    ).rejects.toThrow('viewer_target_changed')
    expect(api.automations.create).not.toHaveBeenCalled()
  } finally {
    view.unmount()
  }
})
