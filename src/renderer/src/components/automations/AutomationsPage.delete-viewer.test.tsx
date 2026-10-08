// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  api,
  installAutomationsPageHarness,
  mocks,
  scopedList
} from './automations-page-test-harness'
import { listedExternalEntries, listedRow } from './automations-page-listed-items'

import { makeAutomation, makeExternalManager } from './automations-page-fixtures'
import { getDefaultSettings } from '../../../../shared/constants'
import { mountDeleteViewerPage } from './automation-delete-viewer-test-page'

installAutomationsPageHarness()
afterEach(cleanup)

it('shares the actual checkbox, focus and cancel controls without deleting or saving a cancelled preference', async () => {
  const update = vi.fn()
  mocks.state.updateSettings = update
  const { apply, request } = await mountDeleteViewerPage()
  const target = await request()
  expect(screen.getByRole('dialog').textContent).toContain('Nightly')
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox'))
  })
  expect((await apply({ kind: 'get' })).deletion).toMatchObject({ dontAskAgain: true })
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'delete-form',
      action: { kind: 'dont-ask-again', reviewedTarget: target, value: false }
    })
  })
  await pending
  expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false')
  screen.getByRole('button', { name: 'Cancel' }).focus()
  await act(async () => {
    pending = apply({ kind: 'delete-form', action: { kind: 'focus', reviewedTarget: target } })
  })
  expect((await pending)?.deletion?.confirmFocused).toBe(true)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }))
  await act(async () => {
    pending = apply({ kind: 'delete-form', action: { kind: 'cancel', reviewedTarget: target } })
  })
  expect((await pending)?.deletion?.open).toBe(false)
  expect(api.automations.delete).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  const next = await request()
  expect(next).not.toBe(target)
  await expect(
    apply({ kind: 'delete-form', action: { kind: 'confirm', reviewedTarget: target } })
  ).rejects.toThrow('viewer_target_changed')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  })
  expect((await apply({ kind: 'get' })).deletion?.open).toBe(false)
})

it('waits for the acknowledged delete after the actual dialog closes and blocks competing mutations', async () => {
  const { apply, request } = await mountDeleteViewerPage()
  const target = await request()
  let finish: (() => void) | undefined
  api.automations.delete.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  let pending: ReturnType<typeof apply> | undefined
  let completed = false
  await act(async () => {
    pending = apply({ kind: 'delete-form', action: { kind: 'confirm', reviewedTarget: target } })
    void pending.then(() => {
      completed = true
    })
  })
  expect((await apply({ kind: 'get' })).deletion).toMatchObject({
    open: false,
    busy: true,
    outcome: null
  })
  expect(completed).toBe(false)
  await expect(apply({ kind: 'query', value: 'other' })).rejects.toThrow('viewer_busy')
  if (!finish) {
    throw new Error('missing delete completion')
  }
  await act(async () => {
    finish?.()
  })
  expect((await pending)?.deletion).toMatchObject({
    busy: false,
    outcome: { mutation: 'acknowledged', refresh: 'completed' }
  })
  expect(api.automations.delete).toHaveBeenCalledTimes(1)
})

it('reports a failed host request as unconfirmed rather than claiming deletion', async () => {
  const { apply, request } = await mountDeleteViewerPage()
  const target = await request()
  api.automations.delete.mockRejectedValueOnce(new Error('host contact lost'))
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'delete-form', action: { kind: 'confirm', reviewedTarget: target } })
  })
  expect((await pending)?.deletion).toMatchObject({
    open: false,
    busy: false,
    outcome: { mutation: 'unconfirmed', refresh: 'completed' }
  })
})

it('observes a deletion started by the actual confirm button', async () => {
  const update = vi.fn()
  mocks.state.updateSettings = update
  const { apply, request } = await mountDeleteViewerPage()
  await request()
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox'))
  })
  let finish: (() => void) | undefined
  api.automations.delete.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  })
  expect((await apply({ kind: 'get' })).deletion).toMatchObject({ open: false, busy: true })
  if (!finish) {
    throw new Error('missing delete completion')
  }
  await act(async () => {
    finish?.()
  })
  expect((await apply({ kind: 'get' })).deletion?.busy).toBe(false)
  expect(update).toHaveBeenCalledExactlyOnceWith({ skipDeleteAutomationConfirm: true })
  expect(api.automations.delete).toHaveBeenCalledTimes(1)
})

it('waits for skip-confirm deletion without mounting a dialog', async () => {
  mocks.state.settings = { ...getDefaultSettings('/tmp'), skipDeleteAutomationConfirm: true }
  const { apply } = await mountDeleteViewerPage()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'delete-form',
      action: { kind: 'request', source: 'local', rowKey: listedRow('a-1').key }
    })
  })
  expect((await pending)?.deletion).toMatchObject({
    open: false,
    busy: false,
    outcome: { mutation: 'acknowledged' }
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(api.automations.delete).toHaveBeenCalledTimes(1)
})
it('rejects an outstanding confirmation when its page unmounts', async () => {
  const { view, apply, request } = await mountDeleteViewerPage()
  const target = await request()
  let finish: (() => void) | undefined
  api.automations.delete.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'delete-form', action: { kind: 'confirm', reviewedTarget: target } })
  })
  const rejected = expect(pending).rejects.toThrow('viewer_unmounted')
  view.unmount()
  await rejected
  await act(async () => {
    finish?.()
  })
})
it('uses the actual external dialog and retains the visible owner scope', async () => {
  api.automations.listExternalManagerForOwner.mockImplementation(
    async ({ provider }: { provider: string }) => ({
      manager: provider === 'hermes' ? makeExternalManager() : null,
      error: null,
      updatedAt: 1
    })
  )
  api.automations.runExternalActionForOwner.mockResolvedValue(undefined)
  const { apply } = await mountDeleteViewerPage()
  const entry = listedExternalEntries()[0]
  if (!entry) {
    throw new Error('missing external entry')
  }
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'delete-form',
      action: { kind: 'request', source: 'external', rowKey: entry.key }
    })
  })
  const target = (await pending)?.deletion?.reviewedTarget
  if (!target) {
    throw new Error('missing external deletion')
  }
  expect(screen.getByRole('dialog').textContent).toContain('Hermes job')
  await expect(
    apply({
      kind: 'delete-form',
      action: { kind: 'dont-ask-again', reviewedTarget: target, value: true }
    })
  ).rejects.toThrow('automation_delete_preference_unavailable')
  screen.getByRole('button', { name: 'Cancel' }).focus()
  await act(async () => {
    pending = apply({ kind: 'delete-form', action: { kind: 'focus', reviewedTarget: target } })
  })
  expect((await pending)?.deletion?.confirmFocused).toBe(true)
  await act(async () => {
    pending = apply({ kind: 'delete-form', action: { kind: 'cancel', reviewedTarget: target } })
  })
  expect((await pending)?.deletion?.open).toBe(false)
  expect(api.automations.runExternalActionForOwner).not.toHaveBeenCalled()
  await act(async () => {
    pending = apply({
      kind: 'delete-form',
      action: { kind: 'request', source: 'external', rowKey: entry.key }
    })
  })
  const next = (await pending)?.deletion?.reviewedTarget
  if (!next) {
    throw new Error('missing reopened target')
  }
  await act(async () => {
    pending = apply({ kind: 'delete-form', action: { kind: 'confirm', reviewedTarget: next } })
  })
  expect((await pending)?.deletion).toMatchObject({
    open: false,
    outcome: { mutation: 'acknowledged', refresh: 'completed' }
  })
  expect(api.automations.runExternalActionForOwner).toHaveBeenCalledExactlyOnceWith({
    ...entry.scope,
    jobId: entry.job.id,
    action: 'delete'
  })
})

it('preserves a different row selected while deletion is awaiting its host', async () => {
  scopedList([makeAutomation(), makeAutomation({ id: 'a-2', name: 'Other' })])
  mocks.state.setSelectedAutomationId = (id: string | null) => {
    mocks.state.selectedAutomationId = id
  }
  const { apply, request } = await mountDeleteViewerPage()
  await act(async () => {
    mocks.listPanel?.selectAutomationRow(listedRow('a-1').key)
  })
  const target = await request()
  let finish: (() => void) | undefined
  api.automations.delete.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'delete-form', action: { kind: 'confirm', reviewedTarget: target } })
  })
  await act(async () => {
    mocks.listPanel?.selectAutomationRow(listedRow('a-2').key)
  })
  const selected = listedRow('a-2').key
  expect((await apply({ kind: 'get' })).selectedRowKey).toBe(selected)
  if (!finish) {
    throw new Error('missing completion')
  }
  await act(async () => {
    finish?.()
  })
  await pending
  expect((await apply({ kind: 'get' })).selectedRowKey).toBe(selected)
})
