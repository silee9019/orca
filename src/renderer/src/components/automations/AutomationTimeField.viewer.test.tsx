// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { applyAutomationTimeViewerAction as apply } from '../../runtime/automation-time-viewer-controller'
import { AutomationTimeField } from './AutomationTimeField'
import { AutomationEditorViewerActionSchema } from '../../../../shared/automation-editor-viewer-command'

afterEach(cleanup)
it('accepts the concrete time form at the editor boundary', () => {
  expect(
    AutomationEditorViewerActionSchema.safeParse({
      kind: 'time-form',
      reviewedTarget: '00000000-0000-4000-8000-000000000001',
      action: { kind: 'get' }
    }).success
  ).toBe(true)
})

function Field({
  mode = 'time',
  hold = false,
  onChange
}: {
  mode?: 'time' | 'minute'
  hold?: boolean
  onChange?: (value: string) => void
}) {
  const [time, setTime] = useState('09:15')
  return (
    <AutomationTimeField
      time={time}
      mode={mode}
      onTimeChange={(next) => {
        onChange?.(next)
        if (!hold) {
          setTime(next)
        }
      }}
    />
  )
}

it('commits actual digit text, steps, auto commit, blur and period through the existing field handlers', async () => {
  const changed = vi.fn()
  render(<Field onChange={changed} />)
  const { reviewedTarget } = await apply({ kind: 'get' })
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({ kind: 'input', reviewedTarget, field: 'hour', value: '1' })
  })
  await expect(request).resolves.toMatchObject({
    time: '09:15',
    hour: { value: 9, text: '1', focused: true }
  })
  expect(screen.getByLabelText('Hour')).toHaveProperty('value', '1')
  expect(changed).not.toHaveBeenCalled()
  await act(async () => {
    request = apply({ kind: 'step', reviewedTarget, field: 'hour', delta: 1 })
  })
  await expect(request).resolves.toMatchObject({ time: '02:15', hour: { value: 2, text: '2' } })
  await act(async () => {
    request = apply({ kind: 'input', reviewedTarget, field: 'minute', value: '9x9 extra' })
  })
  await expect(request).resolves.toMatchObject({ time: '02:59', minute: { value: 59, text: '59' } })
  const count = changed.mock.calls.length
  await act(async () => {
    request = apply({ kind: 'commit', reviewedTarget, field: 'minute' })
  })
  await expect(request).resolves.toMatchObject({ time: '02:59', minute: { focused: false } })
  expect(changed.mock.calls.length).toBe(count)
  await act(async () => {
    request = apply({ kind: 'period', reviewedTarget })
  })
  await expect(request).resolves.toMatchObject({ time: '14:59', period: 'PM' })
  expect(screen.getByRole('button', { name: 'AM or PM: PM' })).toBeTruthy()
  await act(async () => {
    request = apply({ kind: 'input', reviewedTarget, field: 'minute', value: '' })
  })
  await expect(request).resolves.toMatchObject({ time: '14:59', minute: { text: '' } })
  await act(async () => {
    request = apply({ kind: 'commit', reviewedTarget, field: 'minute' })
  })
  await expect(request).resolves.toMatchObject({ time: '14:00', minute: { text: '00', value: 0 } })
  await act(async () => {
    request = apply({ kind: 'step', reviewedTarget, field: 'minute', delta: -1 })
  })
  await expect(request).resolves.toMatchObject({ time: '14:59', minute: { text: '59', value: 59 } })
})

it('rejects hidden hour/period controls, previous mode UUID and an uncommitted parent time', async () => {
  const page = render(<Field mode="minute" />)
  const { reviewedTarget } = await apply({ kind: 'get' })
  expect(screen.queryByLabelText('Hour')).toBeNull()
  await expect(
    apply({ kind: 'input', reviewedTarget, field: 'hour', value: '11' })
  ).rejects.toThrow('automation_time_control_unavailable')
  await expect(apply({ kind: 'period', reviewedTarget })).rejects.toThrow(
    'automation_time_control_unavailable'
  )
  page.rerender(<Field hold />)
  await expect(apply({ kind: 'step', reviewedTarget, field: 'minute', delta: 1 })).rejects.toThrow(
    'viewer_target_changed'
  )
  const state = await apply({ kind: 'get' })
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({
      kind: 'input',
      reviewedTarget: state.reviewedTarget,
      field: 'minute',
      value: '30'
    })
    void request.catch(() => undefined)
  })
  await expect(request).rejects.toThrow('viewer_target_changed')
  expect((await apply({ kind: 'get' })).time).toBe('09:15')
  await act(async () => {
    request = apply({ kind: 'period', reviewedTarget: state.reviewedTarget })
    void request.catch(() => undefined)
  })
  await expect(request).rejects.toThrow('viewer_target_changed')
  page.unmount()
  await expect(apply({ kind: 'get' })).rejects.toThrow('automation_time_unavailable')
})

it('rejects an in-flight digit action when its real field unmounts', async () => {
  const page = render(<Field />)
  const { reviewedTarget } = await apply({ kind: 'get' })
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({ kind: 'input', reviewedTarget, field: 'hour', value: '11' })
    void request.catch(() => undefined)
    page.unmount()
  })
  await expect(request).rejects.toThrow('viewer_unmounted')
})
