// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { AddRemoteHostServerFormPanel } from './AddRemoteHostServerFormPanel'
import WebConnect from '@/web/WebConnect'
import { parseHostAccessLink } from '../../../../shared/remote-pairing-address'
import { applyPairingInputViewerRequest } from '@/runtime/pairing-input-viewer'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
const submit = vi.fn()
function ServerForm({ disabled = false }: { disabled?: boolean }) {
  const [code, setCode] = useState('')
  return (
    <Dialog open>
      <DialogContent>
        <AddRemoteHostServerFormPanel
          name="Fixture"
          pairingCode={code}
          parsedLink={parseHostAccessLink(code)}
          allowLoopback={false}
          disabled={disabled}
          canSubmit={false}
          onNameChange={() => {}}
          onPairingCodeChange={setCode}
          onAllowLoopbackChange={() => {}}
          onSubmit={submit}
          onCancel={() => {}}
        />
      </DialogContent>
    </Dialog>
  )
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applyPairingInputViewerRequest> | undefined
  await act(async () => {
    pending = applyPairingInputViewerRequest({
      id: 'pairing-input',
      expiresAt: Date.now() + 300,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(cleanup)
it('routes actual sidebar panel and fields native/typed private drafts to the same committed owner', async () => {
  render(<ServerForm />)
  const input = screen.getByRole('textbox', { name: /Pairing URL|Pairing code|Access link/ })
  fireEvent.change(input, { target: { value: 'private-native-canary' } })
  expect(
    await invoke({ viewerId: 7, operation: 'pairing-input.get', surface: 'sidebar' })
  ).toMatchObject({ applied: true, state: { configured: true } })
  const result = await invoke({
    viewerId: 7,
    operation: 'pairing-input.set',
    surface: 'sidebar',
    value: 'private-typed-canary'
  })
  expect(result).toMatchObject({ applied: true, persisted: null })
  expect(input).toHaveValue('private-typed-canary')
  expect(JSON.stringify(result)).not.toContain('canary')
  expect(submit).not.toHaveBeenCalled()
  await invoke({ viewerId: 7, operation: 'pairing-input.set', surface: 'sidebar', value: '' })
  expect(input).toHaveValue('')
})
it('routes actual WebConnect native and typed drafts without connecting or persisting', async () => {
  const connected = vi.fn()
  render(<WebConnect initialPairingInput={null} onConnected={connected} />)
  const input = screen.getByLabelText('Pairing URL or code')
  fireEvent.change(input, { target: { value: 'private-web-native-canary' } })
  expect(
    await invoke({ viewerId: 7, operation: 'pairing-input.get', surface: 'web' })
  ).toMatchObject({ state: { configured: true } })
  const result = await invoke({
    viewerId: 7,
    operation: 'pairing-input.set',
    surface: 'web',
    value: 'private-web-typed-canary'
  })
  expect(result.applied).toBe(true)
  expect(input).toHaveValue('private-web-typed-canary')
  expect(JSON.stringify(result)).not.toContain('canary')
  expect(connected).not.toHaveBeenCalled()
  expect(localStorage.length).toBe(0)
})
it('refuses disabled and unmounted forms and never selects another surface', async () => {
  const form = render(<ServerForm disabled />)
  expect(
    await invoke({
      viewerId: 7,
      operation: 'pairing-input.set',
      surface: 'sidebar',
      value: 'private-disabled'
    })
  ).toMatchObject({ applied: false, state: { configured: false, disabled: true } })
  await expect(
    invoke({ viewerId: 7, operation: 'pairing-input.set', surface: 'web', value: 'private-web' })
  ).rejects.toThrow('connections_surface_unavailable')
  form.unmount()
  await expect(
    invoke({ viewerId: 7, operation: 'pairing-input.get', surface: 'sidebar' })
  ).rejects.toThrow('connections_surface_unavailable')
})
