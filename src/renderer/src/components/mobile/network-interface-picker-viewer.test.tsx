// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NetworkInterfacePicker } from './NetworkInterfacePicker'
import { TooltipProvider } from '../ui/tooltip'
import { applyAddressConnectionsViewerRequest } from '@/runtime/address-connections-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
const select = vi.fn(),
  customSelect = vi.fn(),
  remove = vi.fn()
function Fixture() {
  const [value, setValue] = useState<string | undefined>('192.168.1.10')
  const [custom, setCustom] = useState<string[]>([])
  return (
    <TooltipProvider>
      <NetworkInterfacePicker
        networkInterfaces={[
          { name: 'en0', address: '192.168.1.10' },
          { name: 'en1', address: '192.168.1.11' }
        ]}
        customAddresses={custom}
        selectedAddress={value}
        selectedAddressIsCustom={custom.includes(value ?? '')}
        onSelectedAddressChange={(value) => {
          select(value)
          setValue(value)
        }}
        onCustomAddressSelect={(value) => {
          customSelect(value)
          setValue(value)
          setCustom((old) => [...old, value])
        }}
        onCustomAddressRemove={(value) => {
          remove(value)
          setCustom((old) => old.filter((v) => v !== value))
          setValue(undefined)
        }}
      />
    </TooltipProvider>
  )
}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
async function invoke(command: ConnectionsViewerCommand) {
  let applying
  await act(async () => {
    applying = applyAddressConnectionsViewerRequest({
      id: 'fixture',
      expiresAt: Date.now() + 1000,
      command
    })
  })
  return applying
}
const target = { viewerId: 7, pickerId: 'custom-network-address-input' }
it('routes typed select/custom submit/remove through the actual network picker callbacks and preserves remove-key propagation', async () => {
  render(<Fixture />)
  expect(
    (await invoke({ ...target, operation: 'address.select', value: '192.168.1.11' })).applied
  ).toBe(true)
  expect(select).toHaveBeenCalledWith('192.168.1.11')
  await invoke({ ...target, operation: 'address.custom-open', open: true })
  await invoke({ ...target, operation: 'address.custom-draft', value: 'private-fixture.example' })
  const submitted = await invoke({ ...target, operation: 'address.custom-submit' })
  expect(submitted).toMatchObject({ applied: true, persisted: null, state: { customCount: 1 } })
  expect(JSON.stringify(submitted)).not.toContain('private-fixture')
  expect(customSelect).toHaveBeenCalledWith('private-fixture.example')
  await invoke({ ...target, operation: 'address.picker-open', open: true })
  const button = screen.getByRole('button', { name: 'Remove private-fixture.example' })
  const bubbled = vi.fn()
  document.addEventListener('keydown', bubbled)
  try {
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: ' ' })
    expect(bubbled).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    const removed = await invoke({
      ...target,
      operation: 'address.remove',
      value: 'private-fixture.example'
    })
    expect(removed).toMatchObject({ applied: true, state: { customCount: 0 } })
    expect(remove).toHaveBeenCalledWith('private-fixture.example')
    expect(screen.getByRole('listbox')).toHaveFocus()
  } finally {
    document.removeEventListener('keydown', bubbled)
  }
})

it('typed highlight and selection match native typeahead and Space', async () => {
  render(<Fixture />)
  await invoke({ ...target, operation: 'address.picker-open', open: true })
  const list = screen.getByRole('listbox')
  expect(list).toHaveFocus()
  fireEvent.keyDown(list, { key: '1' })
  const next = screen.getByRole('option', { name: /192.168.1.11/ })
  expect(next).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(list, { key: ' ' })
  expect(select).toHaveBeenLastCalledWith('192.168.1.11')
  await invoke({ ...target, operation: 'address.picker-open', open: true })
  expect(
    await invoke({ ...target, operation: 'address.highlight', value: 'detected:192.168.1.10' })
  ).toMatchObject({ applied: true })
  expect(screen.getByRole('option', { name: /192.168.1.10/ })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(
    await invoke({ ...target, operation: 'address.select', value: '192.168.1.10' })
  ).toMatchObject({ applied: true })
  expect(select).toHaveBeenLastCalledWith('192.168.1.10')
})

it('native custom Enter and typed submit share the confirmed parent effect', async () => {
  render(<Fixture />)
  await invoke({ ...target, operation: 'address.custom-open', open: true })
  const input = document.getElementById(target.pickerId)
  if (!input) {
    throw new Error('fixture_input_missing')
  }
  fireEvent.change(input, { target: { value: 'native-fixture.example' } })
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  await act(async () => {
    input.dispatchEvent(event)
  })
  expect(event.defaultPrevented).toBe(true)
  expect(customSelect).toHaveBeenLastCalledWith('native-fixture.example')
  await invoke({ ...target, operation: 'address.custom-open', open: true })
  await invoke({ ...target, operation: 'address.custom-draft', value: 'typed-fixture.example' })
  expect(await invoke({ ...target, operation: 'address.custom-submit' })).toMatchObject({
    applied: true,
    state: { customCount: 2 }
  })
  expect(customSelect).toHaveBeenLastCalledWith('typed-fixture.example')
})
