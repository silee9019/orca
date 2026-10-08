// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { requestRemoteBrowserPane } from '@/runtime/browser-remote-pane-request'
import { useRemoteBrowserPaneCommands } from './use-remote-browser-pane-commands'
import { createRemoteBrowserContextMenuActions } from './remote-browser-context-menu-actions'
import { useRemoteBrowserContextMenuCommands } from './use-remote-browser-context-menu-commands'
import type { RemoteBrowserContextMenu } from './remote-browser-page-input-model'
import { RemoteBrowserPageContextMenu } from './remote-browser-page-context-menu'
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('routes menu commands through the same mounted menu actions and confirms DOM dismissal', async () => {
  const provider = { clipboard: '', external: '', navigated: '', opened: '' }
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: {
        writeClipboardText: async (text: string) => {
          provider.clipboard = text
        }
      },
      shell: {
        openUrl: async (url: string) => {
          provider.external = url
        }
      }
    }
  })
  const initial = {
    x: 10,
    y: 20,
    linkUrl: 'https://link.invalid/',
    pageUrl: 'https://page.invalid/',
    selectionText: 'selected'
  }
  function Owner() {
    const [menu, setMenu] = useState<RemoteBrowserContextMenu | null>(initial)
    const actions = createRemoteBrowserContextMenuActions(
      menu,
      () => setMenu(null),
      async (method) => {
        provider.navigated = method
      },
      async (url) => {
        provider.opened = url
        setMenu(null)
      }
    )
    const performMenu = useRemoteBrowserContextMenuCommands(
      { page: 'local-page', environmentId: 'env-1', remotePageId: 'page-1', active: true },
      menu,
      actions,
      async () => {
        setMenu(initial)
        return true
      }
    )
    useRemoteBrowserPaneCommands({
      page: 'local-page',
      environmentId: 'env-1',
      remotePageId: 'page-1',
      active: true,
      staged: false,
      streamStatus: { kind: 'live' },
      reconnectGeneration: 0,
      reconnect: () => {},
      performMenu
    })
    return menu ? (
      <RemoteBrowserPageContextMenu
        contextMenu={menu}
        onDismiss={() => setMenu(null)}
        onNavigate={() => {}}
        onOpenLinkInOrcaBrowser={() => {}}
        actions={actions}
      />
    ) : null
  }
  const view = render(<Owner />)
  const run = async (
    menuAction:
      | 'copy-link'
      | 'open'
      | 'copy-selection'
      | 'external-page'
      | 'back'
      | 'open-orca'
      | 'dismiss'
  ) => {
    let response: Promise<unknown> | undefined
    await act(async () => {
      response = requestRemoteBrowserPane(
        'local-page',
        {
          action: 'menu',
          menuAction,
          environmentId: 'env-1',
          expectedRemotePageId: 'page-1',
          x: 10,
          y: 20
        },
        Date.now() + 1000
      )
      void response.catch(() => {})
    })
    return response
  }
  await expect(run('copy-link')).resolves.toMatchObject({
    menu: { open: false, clipboardRequested: true }
  })
  expect(provider.clipboard).toBe(initial.linkUrl)
  expect(view.queryByRole('menu')).toBeNull()
  await run('open')
  await act(async () => fireEvent.click(view.getByText('Copy Page URL')))
  expect(provider.clipboard).toBe(initial.pageUrl)
  expect(view.queryByRole('menu')).toBeNull()
  await run('open')
  await run('copy-selection')
  expect(provider.clipboard).toBe('selected')
  await run('open')
  await run('external-page')
  expect(provider.external).toBe(initial.pageUrl)
  await run('open')
  await run('back')
  expect(provider.navigated).toBe('browser.back')
  await run('open')
  await run('open-orca')
  expect(provider.opened).toBe(initial.linkUrl)
  await run('open')
  await run('dismiss')
  expect(view.queryByRole('menu')).toBeNull()
})
