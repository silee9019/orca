// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { useRef, useState, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { requestBrowserAddress } from '@/runtime/browser-address-request'
import type { BrowserAddressState } from '../../../../../shared/rpc-contract/browser-address-params'
import { RemoteBrowserPageToolbar } from './remote-browser-page-toolbar'
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => '' }))
vi.mock('../assemble-chrome/browser-navigation-control-row', () => ({
  BrowserNavigationControlRow: ({
    addressSlot,
    children
  }: {
    addressSlot: ReactNode
    children: ReactNode
  }) => (
    <>
      {addressSlot}
      {children}
    </>
  )
}))
vi.mock('../assemble-chrome/browser-egress-indicator', () => ({
  RemoteRuntimeEgressIndicator: () => null
}))
vi.mock('../annotate/MarkupDrawButton', () => ({ MarkupDrawButton: () => null }))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null
}))
const initial = useAppStore.getInitialState()
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
})
it('connects the remote toolbar address owner and preserves its typed draft/submission callback', async () => {
  const submit = vi.fn()
  function Owner() {
    const input = useRef<HTMLInputElement>(null)
    const [address, setAddress] = useState('before')
    return (
      <RemoteBrowserPageToolbar
        commandOwner={{ page: 'remote-local-page', active: true }}
        runtimeEnvironmentId="env-1"
        addressBarValue={address}
        onAddressBarChange={setAddress}
        onSubmitAddressBar={submit}
        onNavigateToUrl={() => {}}
        onOpenWorkspaceDoc={() => {}}
        addressBarInputRef={input}
        addressBarEditSession={{ pageId: 'remote-local-page', resumed: null }}
        busy={false}
        loading={false}
        markup={{
          state: 'idle',
          isActive: false,
          baseImage: null,
          start: async () => {},
          cancel: () => {},
          complete: async () => {}
        }}
        frameUrl={null}
        isActive
        onBack={() => {}}
        onForward={() => {}}
        onReload={() => {}}
      />
    )
  }
  const view = render(<Owner />)
  let pending: Promise<BrowserAddressState> | undefined
  await act(async () => {
    pending = requestBrowserAddress(
      'remote-local-page',
      { action: 'draft', text: 'remote query' },
      Date.now() + 1000
    )
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({ value: 'remote query', open: true, focused: true })
  const input = view.getByRole('combobox')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('missing actual remote address input')
  }
  expect(input.value).toBe('remote query')
  await act(async () => {
    pending = requestBrowserAddress('remote-local-page', { action: 'submit' }, Date.now() + 1000)
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({ navigationRequested: true, open: false })
  expect(submit).toHaveBeenCalledTimes(1)
})
