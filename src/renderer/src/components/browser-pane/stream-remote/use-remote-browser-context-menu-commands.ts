import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  BrowserRemoteMenuState,
  BrowserRemotePaneCommand
} from '../../../../../shared/rpc-contract/browser-remote-pane-params'
import type { RemoteBrowserContextMenu } from './remote-browser-page-input-model'
import type { RemoteBrowserContextMenuActions } from './remote-browser-context-menu-actions'
type MenuCommand = Extract<BrowserRemotePaneCommand, { action: 'menu' }>
type MenuOwner = {
  page: string
  active: boolean
  environmentId: string
  remotePageId: string | null
}
type Operation = {
  command: MenuCommand
  isCurrent: () => boolean
  expiresAt: number
  inspected?: boolean
  resolve: (value: { menu: BrowserRemoteMenuState }) => void
  reject: (error: Error) => void
}
export function useRemoteBrowserContextMenuCommands(
  owner: MenuOwner | undefined,
  menu: RemoteBrowserContextMenu | null,
  actions: RemoteBrowserContextMenuActions,
  open: (x: number, y: number, isCurrent: () => boolean) => Promise<boolean>
): (
  command: MenuCommand,
  isCurrent: () => boolean,
  expiresAt: number
) => Promise<{ menu: BrowserRemoteMenuState }> {
  const current = useRef({ owner, menu, actions, open })
  const pending = useRef<Operation | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = { owner, menu, actions, open }
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    pending.current = null
    if (!operation.isCurrent() || Date.now() >= operation.expiresAt) {
      operation.reject(new Error('remote_browser_menu_cancelled_effect_unknown'))
      return
    }
    const value = current.current.menu
    const expectedOpen = operation.command.menuAction === 'open'
    if (!!value !== expectedOpen) {
      operation.reject(new Error('remote_browser_menu_commit_unconfirmed'))
      return
    }
    operation.resolve({
      menu: {
        open: !!value,
        hasLink: !!value?.linkUrl,
        hasSelection: !!value?.selectionText.trim(),
        inspected: operation.inspected,
        ...(operation.command.menuAction.startsWith('copy-') ? { clipboardRequested: true } : {}),
        ...(operation.command.menuAction.startsWith('external-') ? { externalRequested: true } : {})
      }
    })
  })
  useEffect(
    () => () => {
      pending.current?.reject(new Error('remote_browser_menu_unmounted_effect_unknown'))
      pending.current = null
    },
    []
  )
  return async (command, isCurrent, expiresAt) => {
    const before = current.current
    if (
      !before.owner?.active ||
      !isCurrent() ||
      before.owner.environmentId !== command.environmentId ||
      before.owner.remotePageId !== command.expectedRemotePageId
    ) {
      throw new Error('remote_browser_menu_owner_mismatch')
    }
    if (command.menuAction === 'status') {
      return {
        menu: {
          open: !!before.menu,
          hasLink: !!before.menu?.linkUrl,
          hasSelection: !!before.menu?.selectionText.trim()
        }
      }
    }
    if (pending.current) {
      if (command.menuAction !== 'dismiss') {
        throw new Error('remote_browser_menu_busy')
      }
      pending.current.reject(new Error('remote_browser_menu_cancelled_effect_unknown'))
      pending.current = null
    }
    let inspected: boolean | undefined
    if (command.menuAction === 'open') {
      if (command.x === undefined || command.y === undefined) {
        throw new Error('remote_browser_menu_coordinates_missing')
      }
      inspected = await before.open(command.x, command.y, isCurrent)
    } else {
      await before.actions[command.menuAction]()
    }
    if (!isCurrent() || Date.now() >= expiresAt) {
      throw new Error('remote_browser_menu_cancelled_effect_unknown')
    }
    return new Promise((resolve, reject) => {
      pending.current = { command, isCurrent, expiresAt, inspected, resolve, reject }
      update((value) => value + 1)
    })
  }
}
