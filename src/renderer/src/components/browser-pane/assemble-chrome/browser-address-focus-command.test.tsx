// @vitest-environment happy-dom
import { useRef, useState, type ReactNode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requestBrowserAddress } from '@/runtime/browser-address-request'
import { requestBrowserChromeAddressFocus } from '@/runtime/browser-chrome-focus-request'
import type { BrowserAddressState } from '../../../../../shared/rpc-contract/browser-address-params'
import { useBrowserPageChromeFocus } from './use-browser-page-chrome-focus'
import { useElementGuestFocus } from './browser-page-guest-focus'
import BrowserAddressBar from './BrowserAddressBar'
const fixture = vi.hoisted(() => ({
  browserUrlHistory: [],
  workspaceDocHistory: [],
  browserDefaultSearchEngine: null,
  browserKagiSessionLink: null,
  consumeAddressBarFocusRequest: vi.fn(() => false),
  keybindings: {}
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof fixture) => unknown) => selector(fixture)
}))
vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutLabel: () => '',
  getShortcutPlatform: () => 'mac'
}))
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { onFocusBrowserAddressBar: () => () => {} }
    }
  })
})
afterEach(cleanup)
function Owner({ active = true, chromePage = 'page' }: { active?: boolean; chromePage?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const guestRef = useRef<HTMLDivElement | null>(null)
  const [value, change] = useState('https://example.test/path')
  const guestFocus = useElementGuestFocus(guestRef)
  useBrowserPageChromeFocus({
    browserTabId: chromePage,
    workspaceId: 'workspace',
    isActive: active,
    chromeShortcutScope: active ? 'focused' : 'inactive',
    addressBarInputRef: inputRef,
    guestFocus
  })
  return (
    <>
      <div ref={guestRef} tabIndex={0} data-testid="guest" />
      <BrowserAddressBar
        value={value}
        onChange={change}
        onSubmit={vi.fn()}
        onNavigate={vi.fn()}
        inputRef={inputRef}
        commandOwner={{ page: 'page', active }}
      />
    </>
  )
}
async function focus() {
  let result: Promise<BrowserAddressState> | undefined
  await act(async () => {
    result = requestBrowserAddress('page', { action: 'focus' }, Date.now() + 5000)
    void result.catch(() => {})
  })
  if (!result) {
    throw new Error('missing focus response')
  }
  return result
}
it('reuses the actual chrome hook guest blur before input focus and full selection', async () => {
  const view = render(<Owner />)
  const guest = view.getByTestId('guest')
  const input = view.getByRole('combobox')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('input missing')
  }
  guest.focus()
  expect(document.activeElement).toBe(guest)
  const blur = vi.spyOn(guest, 'blur')
  const inputFocus = vi.spyOn(input, 'focus')
  const select = vi.spyOn(input, 'select')
  const result = await focus()
  expect(blur).toHaveBeenCalledOnce()
  expect(blur.mock.invocationCallOrder[0]).toBeLessThan(inputFocus.mock.invocationCallOrder[0])
  expect(inputFocus.mock.invocationCallOrder[0]).toBeLessThan(select.mock.invocationCallOrder[0])
  expect(result).toMatchObject({
    open: true,
    focused: true,
    chromeFocusOwnerInvoked: true,
    selection: { start: 0, end: input.value.length }
  })
  expect(document.activeElement).toBe(input)
  input.setSelectionRange(2, 4)
  await focus()
  expect(input.selectionStart).toBe(0)
  expect(input.selectionEnd).toBe(input.value.length)
  expect(blur).toHaveBeenCalledTimes(2)
})
it('does not substitute address open when the exact chrome owner is unavailable', async () => {
  const view = render(<Owner chromePage="other-page" />)
  const guest = view.getByTestId('guest')
  guest.focus()
  await expect(focus()).rejects.toThrow('chrome_focus_unavailable')
  expect(document.activeElement).toBe(guest)
})
it('refuses an inactive address and chrome owner without blurring the guest', async () => {
  const view = render(<Owner active={false} />)
  const guest = view.getByTestId('guest')
  guest.focus()
  await expect(focus()).rejects.toThrow('viewer_inactive')
  expect(document.activeElement).toBe(guest)
})
it('removes the actual hook receiver on unmount', () => {
  const view = render(<Owner />)
  view.unmount()
  expect(requestBrowserChromeAddressFocus('page')).toBe('unavailable')
})
