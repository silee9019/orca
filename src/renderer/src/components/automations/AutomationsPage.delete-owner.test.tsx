// @vitest-environment happy-dom
import { act } from 'react'
import { expect, it } from 'vitest'
import {
  installAutomationsPageHarness,
  mocks,
  renderPage,
  runtimeHost,
  RUNTIME_ID,
  RUNTIME_SELF_FILTER,
  settleHostQueries
} from './automations-page-test-harness'
import { listedRows } from './automations-page-listed-items'
import { makeAutomation } from './automations-page-fixtures'

import { applyAutomationViewerAction as apply } from '../../runtime/automation-viewer-controller'

installAutomationsPageHarness()

it('pins the reviewed pairing revision after the runtime was paired again', async () => {
  runtimeHost([makeAutomation({ id: 'a-1' })], [])
  mocks.state.automationHostFilter = RUNTIME_SELF_FILTER
  const { rerender } = await renderPage()
  await settleHostQueries()
  const row = listedRows()[0]
  if (!row) {
    throw new Error('runtime row fixture missing')
  }
  await act(async () => mocks.listPanel?.requestDeleteAutomation(row))
  expect(mocks.deleteDialog?.deleteTarget?.id).toBe('a-1')
  mocks.state.runtimeEnvironments = [
    { id: RUNTIME_ID, name: 'GPU box', createdAt: 1, pairingRevision: 9 }
  ]
  await rerender()
  await settleHostQueries()
  mocks.callRuntimeRpc.mockClear()
  await act(async () => mocks.deleteDialog?.onConfirm())
  expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
    { kind: 'environment', environmentId: RUNTIME_ID },
    'automation.delete',
    { id: 'a-1', expectedOwner: { selector: { kind: 'self' } } },
    expect.objectContaining({ expectedEnvironmentPairingRevision: 4 })
  )
})

it('rotates the reviewed target and refuses CLI confirmation after the owner is paired again', async () => {
  runtimeHost([makeAutomation()], [])
  mocks.state.automationHostFilter = RUNTIME_SELF_FILTER
  const { rerender } = await renderPage({ strict: true })
  await settleHostQueries()
  let pending: ReturnType<typeof apply> | undefined
  const row = listedRows()[0]
  if (!row) {
    throw new Error('missing runtime row')
  }
  await act(async () => {
    pending = apply({
      kind: 'delete-form',
      action: { kind: 'request', source: 'local', rowKey: row.key }
    })
  })
  const before = (await pending)?.deletion?.reviewedTarget
  if (!before) {
    throw new Error('missing target')
  }
  mocks.state.runtimeEnvironments = [
    { id: RUNTIME_ID, name: 'GPU box', createdAt: 1, pairingRevision: 9 }
  ]
  await rerender()
  await settleHostQueries()
  const after = (await apply({ kind: 'get' })).deletion
  expect(after?.ownerAvailable).toBe(false)
  expect(after?.reviewedTarget).not.toBe(before)
  await expect(
    apply({ kind: 'delete-form', action: { kind: 'confirm', reviewedTarget: before } })
  ).rejects.toThrow('viewer_target_changed')
  if (!after?.reviewedTarget) {
    throw new Error('missing updated target')
  }
  await expect(
    apply({
      kind: 'delete-form',
      action: { kind: 'confirm', reviewedTarget: after.reviewedTarget }
    })
  ).rejects.toThrow('automation_delete_owner_unavailable')
  const token = after.reviewedTarget
  mocks.callRuntimeRpc.mockClear()
  await act(async () => {
    pending = apply({ kind: 'delete-form', action: { kind: 'dismiss', reviewedTarget: token } })
  })
  await pending
  expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
})
