// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BrowserContextMenuRequestedEvent } from '../../../../../shared/browser-guest-events'
import type {
  BrowserContextMenuAction,
  BrowserContextMenuState
} from '../../../../../shared/rpc-contract/browser-context-menu-params'
import { requestBrowserContextMenu } from '@/runtime/browser-context-menu-request'
import { BrowserPageContextMenu } from './browser-page-context-menu'
const fixture = vi.hoisted(() => {
  let requested: ((event: BrowserContextMenuRequestedEvent) => void) | undefined
  return {
    get requested() {
      return requested
    },
    set requested(value: ((event: BrowserContextMenuRequestedEvent) => void) | undefined) {
      requested = value
    },
    inspect: vi.fn(),
    external: vi.fn(),
    legacyExternal: vi.fn(),
    createBrowserTab: vi.fn(),
    clipboard: '',
    matches: true,
    write: vi.fn(),
    read: vi.fn()
  }
})
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof fixture) => unknown) => selector(fixture)
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/lib/ui-zoom', () => ({ windowDipToCssPx: (value: number) => value }))
const back = vi.fn(),
  forward = vi.fn(),
  reload = vi.fn()
const guest = Object.assign(document.createElement('div'), { goBack: back, goForward: forward })
guest.tabIndex = 0
beforeEach(() => {
  vi.clearAllMocks()
  fixture.inspect.mockResolvedValue(true)
  fixture.external.mockResolvedValue({ opened: true })
  fixture.matches = true
  fixture.clipboard = ''
  fixture.write.mockImplementation(async (text: string) => {
    fixture.clipboard = text
  })
  fixture.read.mockImplementation(async () =>
    fixture.matches ? fixture.clipboard : 'different clipboard'
  )
  document.body.append(guest)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      browser: {
        openDevTools: fixture.inspect,
        onContextMenuRequested: (callback: (event: BrowserContextMenuRequestedEvent) => void) => {
          fixture.requested = callback
          return () => {
            fixture.requested = undefined
          }
        },
        onContextMenuDismissed: () => () => {}
      },
      shell: { openUrl: fixture.legacyExternal, openVerifiedUrl: fixture.external },
      ui: { writeClipboardText: fixture.write, readClipboardText: fixture.read }
    }
  })
})
afterEach(() => {
  cleanup()
  guest.remove()
})
function Owner({ active = true, canBack = true }: { active?: boolean; canBack?: boolean }) {
  return (
    <BrowserPageContextMenu
      browserPageId="page"
      worktreeId="folder"
      isActive={active}
      canGoBack={canBack}
      canGoForward={true}
      webviewRef={{ current: guest }}
      onReload={reload}
    />
  )
}
function open(overrides: Partial<BrowserContextMenuRequestedEvent> = {}) {
  act(() =>
    fixture.requested?.({
      browserPageId: 'page',
      x: 40,
      y: 50,
      screenX: 40,
      screenY: 50,
      linkUrl: 'https://link.test/path',
      pageUrl: 'https://page.test/path',
      selectionText: 'selected text',
      canGoBack: true,
      canGoForward: true,
      ...overrides
    })
  )
}
async function command(action: BrowserContextMenuAction) {
  let response: Promise<BrowserContextMenuState> | undefined
  await act(async () => {
    response = requestBrowserContextMenu('page', action, Date.now() + 5000)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing context response')
  }
  return response
}
it('uses original enabled-item keyboard navigation, native reopen focus and close guest handoff', async () => {
  const view = render(<Owner canBack={false} />)
  expect(await command('status')).toMatchObject({ open: false })
  open()
  const menu = view.getByRole('menu')
  const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
  expect(document.activeElement).toBe(items[0])
  expect(await command('next')).toMatchObject({ focusedItem: 1 })
  expect(await command('previous')).toMatchObject({ focusedItem: 0 })
  expect(await command('previous')).toMatchObject({ focusedItem: items.length - 1 })
  expect(await command('first')).toMatchObject({ focusedItem: 0 })
  expect(await command('last')).toMatchObject({ focusedItem: items.length - 1 })
  open({ screenX: 70 })
  expect(document.activeElement).toBe(items[0])
  expect(await command('close')).toMatchObject({ open: false, guestFocusRequested: true })
  expect(view.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(guest)
})
it.each([
  ['copy-link', 'https://link.test/path'],
  ['copy-page-url', 'https://page.test/path'],
  ['copy-selection', 'selected text']
] as const)(
  'invokes original %s and observes exact clipboard effect plus menu closure',
  async (action, text) => {
    const view = render(<Owner />)
    open()
    const result = await command(action)
    expect(fixture.write).toHaveBeenCalledExactlyOnceWith(text)
    expect(fixture.clipboard).toBe(text)
    expect(result).toMatchObject({ open: false, clipboardWritten: true, guestFocusRequested: true })
    expect(view.queryByRole('menu')).toBeNull()
    expect(JSON.stringify(result)).not.toContain(text)
  }
)
it.each(['back', 'forward', 'reload'] as const)(
  'runs the exact %s owner callback and reports only navigation requested',
  async (action) => {
    render(<Owner />)
    open()
    expect(await command(action)).toMatchObject({ open: false, navigationRequested: true })
    expect(
      action === 'back' ? back : action === 'forward' ? forward : reload
    ).toHaveBeenCalledOnce()
  }
)
it('does not claim successful copy when readback differs after the original menu already closed', async () => {
  const view = render(<Owner />)
  open()
  fixture.matches = false
  await expect(command('copy-selection')).rejects.toThrow('clipboard_unverifiable_effect_unknown')
  expect(fixture.write).toHaveBeenCalledWith('selected text')
  expect(view.queryByRole('menu')).toBeNull()
})
it('refuses missing selection, disabled native back, inactive and foreign owners before callbacks', async () => {
  const view = render(<Owner canBack={false} />)
  open({ linkUrl: null, selectionText: '' })
  await expect(command('copy-link')).rejects.toThrow('action_unavailable')
  await expect(command('copy-selection')).rejects.toThrow('action_unavailable')
  await expect(command('back')).rejects.toThrow('action_unavailable')
  expect(back).not.toHaveBeenCalled()
  expect(fixture.write).not.toHaveBeenCalled()
  await expect(requestBrowserContextMenu('other', 'close', Date.now() + 5000)).rejects.toThrow(
    'unavailable'
  )
  view.rerender(<Owner active={false} />)
  await expect(command('close')).rejects.toThrow('inactive')
  expect(view.getByRole('menu')).toBeTruthy()
})
it('preserves original Escape keyboard close and guest focus handoff', () => {
  const view = render(<Owner />)
  open()
  fireEvent.keyDown(view.getByRole('menu'), { key: 'Escape' })
  expect(view.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(guest)
})

it.each(['open-link-external', 'open-page-external'] as const)(
  'uses strict existing shell acknowledgement for %s and closes original menu',
  async (action) => {
    const view = render(<Owner />)
    open()
    expect(await command(action)).toMatchObject({
      open: false,
      externalOpened: true,
      externalWindowVerified: false,
      guestFocusRequested: true
    })
    expect(fixture.external).toHaveBeenCalledWith(
      action === 'open-link-external' ? 'https://link.test/path' : 'https://page.test/path'
    )
    expect(fixture.legacyExternal).not.toHaveBeenCalled()
    expect(view.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(guest)
  }
)
it.each([undefined, {}, { opened: false }])(
  'rejects old or negative external acknowledgement %j after closing menu',
  async (ack) => {
    const view = render(<Owner />)
    fixture.external.mockResolvedValue(ack)
    open()
    await expect(command('open-link-external')).rejects.toThrow('external_url_open_unverifiable')
    expect(view.queryByRole('menu')).toBeNull()
  }
)
it('refuses file external target and preserves normal UI legacy invocation', async () => {
  const view = render(<Owner />)
  open({ linkUrl: 'file:///blocked' })
  await expect(command('open-link-external')).rejects.toThrow('target_unavailable')
  expect(fixture.external).not.toHaveBeenCalled()
  open()
  fireEvent.click(view.getByText('Open Link In Default Browser'))
  expect(fixture.legacyExternal).toHaveBeenCalledWith('https://link.test/path')
  expect(fixture.external).not.toHaveBeenCalled()
  expect(view.queryByRole('menu')).toBeNull()
})

it('waits for the original asynchronous write before exact clipboard readback', async () => {
  render(<Owner />)
  let release: () => void = () => {
    throw new Error('missing write')
  }
  fixture.write.mockImplementation(
    (text: string) =>
      new Promise<void>((resolve) => {
        release = () => {
          fixture.clipboard = text
          resolve()
        }
      })
  )
  open()
  let finished = false
  let response: Promise<BrowserContextMenuState> | undefined
  await act(async () => {
    response = requestBrowserContextMenu('page', 'copy-link', Date.now() + 5000)
    void response.then(() => {
      finished = true
    })
  })
  if (!response) {
    throw new Error('missing response')
  }
  expect(fixture.write).toHaveBeenCalledOnce()
  expect(fixture.read).not.toHaveBeenCalled()
  expect(finished).toBe(false)
  await act(async () => {
    release()
  })
  expect(await response).toMatchObject({ open: false, clipboardWritten: true })
  expect(fixture.read).toHaveBeenCalledOnce()
})
it('propagates an original write failure without reading or acknowledging clipboard success', async () => {
  render(<Owner />)
  fixture.write.mockRejectedValue(new Error('native denied'))
  open()
  await expect(command('copy-page-url')).rejects.toThrow('clipboard_unverifiable_effect_unknown')
  expect(fixture.read).not.toHaveBeenCalled()
})

it('waits for the original inspect service acknowledgement and reports no native window observation', async () => {
  const view = render(<Owner />)
  open()
  expect(await command('inspect')).toMatchObject({
    open: false,
    devToolsRequested: true,
    devToolsWindowVerified: false,
    guestFocusRequested: true
  })
  expect(fixture.inspect).toHaveBeenCalledWith({ browserPageId: 'page' })
  expect(view.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(guest)
})
it.each([false, undefined])(
  'refuses missing guest/offscreen or old inspect response %j',
  async (response) => {
    const view = render(<Owner />)
    fixture.inspect.mockResolvedValue(response)
    open()
    await expect(command('inspect')).rejects.toThrow('inspect_unavailable')
    expect(view.queryByRole('menu')).toBeNull()
  }
)

it('does not acknowledge inspect before its original service responds', async () => {
  render(<Owner />)
  let release: (accepted: boolean) => void = () => {
    throw new Error('missing service')
  }
  fixture.inspect.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        release = resolve
      })
  )
  open()
  let response: ReturnType<typeof requestBrowserContextMenu> | undefined
  let finished = false
  await act(async () => {
    response = requestBrowserContextMenu('page', 'inspect', Date.now() + 5000)
    void response.then(() => {
      finished = true
    })
  })
  expect(finished).toBe(false)
  await act(async () => {
    release(true)
  })
  expect(await response).toMatchObject({ devToolsRequested: true, open: false })
})
