// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AddressPicker } from './AddressPicker'
import { applyAddressConnectionsViewerRequest } from '@/runtime/address-connections-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
afterEach(cleanup)
function Fixture({ reject = false, ignore = false }: { reject?: boolean; ignore?: boolean }) {
  const [value, setValue] = useState('local')
  const [custom, setCustom] = useState<string[]>([])
  return (
    <AddressPicker
      options={[{ value: 'local', label: 'Local' }]}
      value={value}
      customOptions={custom.map((value) => ({ value, label: value }))}
      onValueChange={setValue}
      onCustomValueChange={(next) => {
        if (ignore) {
          return
        }
        setValue(next)
        setCustom((old) => [...old, next])
      }}
      onCustomRemove={(next) => {
        setCustom((old) => old.filter((value) => value !== next))
        setValue('local')
      }}
      beforeCustomConfirm={() => !reject}
      formatCustomLabel={(value) => value}
      addCustomLabel="Add"
      customDialogCopy={{
        title: 'Custom',
        description: 'Choose',
        inputLabel: 'Address',
        placeholder: 'host',
        hint: 'Hint',
        cancel: 'Cancel',
        confirm: 'Save'
      }}
      validateCustom={(value) => (value.includes('.') ? { ok: true, value } : { ok: false })}
      customInputId="fixture-address"
      placeholder="Address"
      triggerAriaLabel="Address picker"
    />
  )
}
async function invoke(command: ConnectionsViewerCommand) {
  let result
  await act(async () => {
    result = applyAddressConnectionsViewerRequest({
      id: 'fixture',
      command,
      expiresAt: Date.now() + 500
    })
  })
  return result
}
it('commits private custom draft through the real picker/dialog parents and removes the saved option', async () => {
  render(<Fixture />)
  expect(
    await invoke({
      viewerId: 7,
      pickerId: 'fixture-address',
      operation: 'address.custom-open',
      open: true
    })
  ).toMatchObject({ applied: true, state: { dialogOpen: true } })
  const draft = await invoke({
    viewerId: 7,
    pickerId: 'fixture-address',
    operation: 'address.custom-draft',
    value: 'private-canary.example'
  })
  expect(draft).toMatchObject({ applied: true, state: { draftSet: true, valid: true } })
  expect(JSON.stringify(draft)).not.toContain('private-canary')
  expect(
    await invoke({ viewerId: 7, pickerId: 'fixture-address', operation: 'address.custom-submit' })
  ).toMatchObject({ applied: true, persisted: null, state: { dialogOpen: false, customCount: 1 } })
  expect(
    await invoke({
      viewerId: 7,
      pickerId: 'fixture-address',
      operation: 'address.remove',
      value: 'private-canary.example'
    })
  ).toMatchObject({ applied: true, state: { customCount: 0 } })
})
it('preserves rejected custom confirmation in the actual dialog for retry or cancellation', async () => {
  render(<Fixture reject />)
  await invoke({
    viewerId: 7,
    pickerId: 'fixture-address',
    operation: 'address.custom-open',
    open: true
  })
  await invoke({
    viewerId: 7,
    pickerId: 'fixture-address',
    operation: 'address.custom-draft',
    value: 'valid.example'
  })
  expect(
    await invoke({ viewerId: 7, pickerId: 'fixture-address', operation: 'address.custom-submit' })
  ).toMatchObject({
    applied: false,
    persisted: false,
    state: { dialogOpen: true, confirmationFailed: true, customCount: 0 }
  })
  expect(
    await invoke({ viewerId: 7, pickerId: 'fixture-address', operation: 'address.custom-cancel' })
  ).toMatchObject({ applied: true, state: { dialogOpen: false } })
})

it('does not acknowledge a closed dialog when its parent ignores the confirmed address', async () => {
  render(<Fixture ignore />)
  await invoke({
    viewerId: 7,
    pickerId: 'fixture-address',
    operation: 'address.custom-open',
    open: true
  })
  await invoke({
    viewerId: 7,
    pickerId: 'fixture-address',
    operation: 'address.custom-draft',
    value: 'ignored.example'
  })
  expect(
    await invoke({ viewerId: 7, pickerId: 'fixture-address', operation: 'address.custom-submit' })
  ).toMatchObject({ applied: false, persisted: null, state: { dialogOpen: false, customCount: 0 } })
})
