import { normalizeExternalBrowserUrl } from '../../../../../shared/browser-url'
import type { BrowserRemoteMenuCommand } from '../../../../../shared/rpc-contract/browser-remote-pane-params'
import type { RemoteBrowserContextMenu } from './remote-browser-page-input-model'
type MenuAction = Exclude<BrowserRemoteMenuCommand['menuAction'], 'open' | 'status'>
export type RemoteBrowserContextMenuActions = Record<MenuAction, () => Promise<void>>
export function createRemoteBrowserContextMenuActions(
  menu: RemoteBrowserContextMenu | null,
  dismiss: () => void,
  navigate: (method: 'browser.back' | 'browser.forward' | 'browser.reload') => void | Promise<void>,
  openOrca: (url: string) => void | Promise<void>
): RemoteBrowserContextMenuActions {
  const requireMenu = (): RemoteBrowserContextMenu => {
    if (!menu) {
      throw new Error('remote_browser_context_menu_closed')
    }
    return menu
  }
  const copy = (kind: 'link' | 'page' | 'selection'): Promise<void> => {
    const value = requireMenu()
    const text =
      kind === 'link' ? value.linkUrl : kind === 'page' ? value.pageUrl : value.selectionText
    if (!text || (kind === 'selection' && !text.trim())) {
      throw new Error('remote_browser_context_menu_item_unavailable')
    }
    const effect = window.api.ui.writeClipboardText(text)
    dismiss()
    return effect
  }
  const external = (kind: 'link' | 'page'): Promise<void> => {
    const value = requireMenu()
    const url = normalizeExternalBrowserUrl(kind === 'link' ? (value.linkUrl ?? '') : value.pageUrl)
    const effect = url
      ? window.api.shell.openUrl(url)
      : Promise.reject(new Error('remote_browser_external_url_unavailable'))
    dismiss()
    return effect
  }
  const move = (method: 'browser.back' | 'browser.forward' | 'browser.reload'): Promise<void> => {
    requireMenu()
    const effect = Promise.resolve(navigate(method))
    dismiss()
    return effect
  }
  return {
    dismiss: async () => dismiss(),
    'copy-link': () => copy('link'),
    'copy-page': () => copy('page'),
    'copy-selection': () => copy('selection'),
    'external-link': () => external('link'),
    'external-page': () => external('page'),
    'open-orca': () => {
      const url = requireMenu().linkUrl
      if (!url) {
        throw new Error('remote_browser_context_menu_item_unavailable')
      }
      dismiss()
      return Promise.resolve(openOrca(url))
    },
    back: () => move('browser.back'),
    forward: () => move('browser.forward'),
    reload: () => move('browser.reload')
  }
}
