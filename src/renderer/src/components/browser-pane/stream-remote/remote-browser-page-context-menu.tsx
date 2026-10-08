import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { redactKagiSessionToken } from '../../../../../shared/browser-url'
import {
  createRemoteBrowserContextMenuActions,
  type RemoteBrowserContextMenuActions
} from './remote-browser-context-menu-actions'
import { useRemoteBrowserContextMenuCommands } from './use-remote-browser-context-menu-commands'
import type {
  BrowserRemotePaneCommand,
  BrowserRemoteMenuState
} from '../../../../../shared/rpc-contract/browser-remote-pane-params'
import { isRemoteBrowserPageMissingError } from './remote-browser-stream-errors'
import type { RemoteBrowserStreamLifecycle } from './remote-browser-stream-lifecycle'
import type { RemoteBrowserOperationToken } from './remote-browser-stream-tokens'
import {
  buildRemoteContextMenuExpression,
  readRemoteContextMenuResult,
  type RemoteBrowserContextMenu,
  type RemoteBrowserPaneNotice,
  type RemoteBrowserRuntimeTarget
} from './remote-browser-page-input-model'

export function useRemoteBrowserPageContextMenu({
  busy,
  browserTabUrl,
  imageRef,
  runtimeTarget,
  lifecycle,
  runtimeWorktree,
  getRemoteImagePoint,
  enqueueRemoteInput,
  createRemoteOperationToken,
  isCurrentRemoteOperationToken,
  closeMissingRemotePage,
  mountedRef,
  setPaneNotice,
  commandOwner,
  onNavigate,
  onOpenLink
}: {
  commandOwner?: {
    page: string
    active: boolean
    environmentId: string
    remotePageId: string | null
  }
  onNavigate?: (method: 'browser.back' | 'browser.forward' | 'browser.reload') => Promise<void>
  onOpenLink?: (url: string) => Promise<void>
  busy: boolean
  browserTabUrl: string
  imageRef: React.RefObject<HTMLImageElement | null>
  runtimeTarget: () => RemoteBrowserRuntimeTarget | null
  lifecycle: RemoteBrowserStreamLifecycle
  runtimeWorktree: string
  getRemoteImagePoint: (event: {
    clientX: number
    clientY: number
  }) => { x: number; y: number } | null
  enqueueRemoteInput: (operation: () => Promise<void>) => Promise<void>
  createRemoteOperationToken: (remotePageId?: string | null) => RemoteBrowserOperationToken | null
  isCurrentRemoteOperationToken: (token: RemoteBrowserOperationToken) => boolean
  closeMissingRemotePage: (remotePageId?: string | null) => void
  mountedRef: React.RefObject<boolean>
  setPaneNotice: (notice: RemoteBrowserPaneNotice | null) => void
}): {
  actions: RemoteBrowserContextMenuActions
  performMenu: (
    command: Extract<BrowserRemotePaneCommand, { action: 'menu' }>,
    isCurrent: () => boolean,
    expiresAt: number
  ) => Promise<{ menu: BrowserRemoteMenuState }>
  contextMenu: RemoteBrowserContextMenu | null
  setContextMenu: React.Dispatch<React.SetStateAction<RemoteBrowserContextMenu | null>>
  handleRemoteContextMenu: (event: React.MouseEvent<HTMLImageElement>) => void
} {
  const [contextMenu, setContextMenu] = useState<RemoteBrowserContextMenu | null>(null)

  useEffect(() => {
    if (!contextMenu) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setContextMenu(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [contextMenu])

  const openRemoteContextMenuAt = async (
    event: { clientX: number; clientY: number },
    isCurrent = () => true
  ): Promise<boolean> => {
    if (busy || !isCurrent()) {
      throw new Error('remote_browser_context_menu_unavailable')
    }
    const target = runtimeTarget()
    const pageId = lifecycle.tokens.remotePage
    const point = getRemoteImagePoint(event)
    if (!target || !pageId || !point) {
      throw new Error('remote_browser_context_menu_unavailable')
    }
    imageRef.current?.focus()
    setPaneNotice(null)
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      linkUrl: null,
      pageUrl: browserTabUrl || 'about:blank',
      // Why: filled in below once the async eval reads the guest selection.
      selectionText: ''
    })
    let inspected = false
    await enqueueRemoteInput(async () => {
      const operationToken = createRemoteOperationToken(pageId)
      if (!operationToken || !isCurrentRemoteOperationToken(operationToken) || !isCurrent()) {
        return
      }
      try {
        const result = await callRuntimeRpc(
          target,
          'browser.eval',
          {
            worktree: runtimeWorktree,
            page: pageId,
            expression: buildRemoteContextMenuExpression(point.x, point.y)
          },
          { timeoutMs: 15_000, suppressFeatureInteraction: true }
        )
        const parsed = readRemoteContextMenuResult(result)
        if (
          parsed &&
          mountedRef.current &&
          isCurrentRemoteOperationToken(operationToken) &&
          isCurrent()
        ) {
          inspected = true
          setContextMenu((current) =>
            current
              ? {
                  ...current,
                  linkUrl: parsed.linkUrl,
                  pageUrl: redactKagiSessionToken(parsed.pageUrl),
                  selectionText: parsed.selectionText
                }
              : current
          )
        }
      } catch (error) {
        if (
          isCurrentRemoteOperationToken(operationToken) &&
          isRemoteBrowserPageMissingError(error)
        ) {
          closeMissingRemotePage(pageId)
        }
        // Keep the basic menu open even if element inspection is unavailable.
      }
    })
    return inspected
  }
  const handleRemoteContextMenu = (event: React.MouseEvent<HTMLImageElement>): void => {
    if (busy) {
      return
    }
    const target = runtimeTarget()
    if (!target || !lifecycle.tokens.remotePage || !getRemoteImagePoint(event)) {
      return
    }
    event.preventDefault()
    void openRemoteContextMenuAt(event).catch(() => {})
  }
  const actions = createRemoteBrowserContextMenuActions(
    contextMenu,
    () => setContextMenu(null),
    (method) =>
      onNavigate
        ? onNavigate(method)
        : Promise.reject(new Error('remote_browser_navigation_owner_unavailable')),
    (url) =>
      onOpenLink
        ? onOpenLink(url)
        : Promise.reject(new Error('remote_browser_open_owner_unavailable'))
  )
  const performMenu = useRemoteBrowserContextMenuCommands(
    commandOwner,
    contextMenu,
    actions,
    async (x, y, isCurrent) => {
      const rect = imageRef.current?.getBoundingClientRect()
      if (!rect || x >= rect.width || y >= rect.height) {
        throw new Error('remote_browser_context_menu_coordinates_outside_viewport')
      }
      return openRemoteContextMenuAt({ clientX: rect.left + x, clientY: rect.top + y }, isCurrent)
    }
  )
  return { contextMenu, setContextMenu, handleRemoteContextMenu, actions, performMenu }
}

export function RemoteBrowserPageContextMenu({
  contextMenu,
  onDismiss,
  onOpenLinkInOrcaBrowser,
  onNavigate,
  actions
}: {
  contextMenu: RemoteBrowserContextMenu
  actions?: RemoteBrowserContextMenuActions
  onDismiss?: () => void
  onOpenLinkInOrcaBrowser?: () => void
  onNavigate?: (method: 'browser.back' | 'browser.forward' | 'browser.reload') => void
}): React.JSX.Element {
  const menuActions =
    actions ??
    createRemoteBrowserContextMenuActions(
      contextMenu,
      onDismiss ??
        (() => {
          throw new Error('remote_browser_menu_dismiss_owner_unavailable')
        }),
      onNavigate ??
        (() => {
          throw new Error('remote_browser_menu_navigation_owner_unavailable')
        }),
      () => {
        if (!onOpenLinkInOrcaBrowser) {
          throw new Error('remote_browser_menu_open_owner_unavailable')
        }
        onOpenLinkInOrcaBrowser()
      }
    )
  const run = (action: keyof RemoteBrowserContextMenuActions): void => {
    void (async () => {
      await menuActions[action]()
    })().catch(() => {})
  }
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = contextMenuRef.current
    if (!el) {
      return
    }
    el.style.left = `${contextMenu.x}px`
    el.style.top = `${contextMenu.y}px`
    const rect = el.getBoundingClientRect()
    const offsetX = contextMenu.x - rect.left
    const offsetY = contextMenu.y - rect.top
    let renderX = contextMenu.x
    let renderY = contextMenu.y
    if (rect.right > window.innerWidth) {
      renderX = contextMenu.x - rect.width
    }
    if (rect.bottom > window.innerHeight) {
      renderY = contextMenu.y - rect.height
    }
    el.style.left = `${Math.max(0, renderX) + offsetX}px`
    el.style.top = `${Math.max(0, renderY) + offsetY}px`
  }, [contextMenu])

  return createPortal(
    <>
      <div className="fixed inset-0 z-50" onPointerDown={() => run('dismiss')} />
      <div
        ref={contextMenuRef}
        role="menu"
        data-testid="remote-browser-context-menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        className="fixed z-50 min-w-[13rem] overflow-hidden rounded-[11px] border border-black/14 bg-[rgba(255,255,255,0.82)] p-1 text-black shadow-[0_16px_36px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl dark:border-white/14 dark:bg-[rgba(0,0,0,0.72)] dark:text-white dark:shadow-[0_20px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        {contextMenu.linkUrl ? (
          <>
            <button
              role="menuitem"
              className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
              onClick={() => run('open-orca')}
            >
              {translate(
                'auto.components.browser.pane.BrowserPane.b5b87d6cbb',
                'Open Link In Orca Browser'
              )}
            </button>
            <button
              role="menuitem"
              className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
              onClick={() => run('external-link')}
            >
              {translate(
                'auto.components.browser.pane.BrowserPane.8ce4f6b12e',
                'Open Link In Default Browser'
              )}
            </button>
            <button
              role="menuitem"
              className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
              onClick={() => run('copy-link')}
            >
              {translate(
                'auto.components.browser.pane.BrowserPane.efb0e8f7f3',
                'Copy Link Address'
              )}
            </button>
            <div className="my-1 h-px bg-border/70" />
          </>
        ) : null}
        {contextMenu.selectionText.trim() ? (
          <>
            <button
              role="menuitem"
              className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
              onClick={() => run('copy-selection')}
            >
              {translate('auto.components.browser.pane.BrowserPane.2a4c4b8e1f', 'Copy')}
            </button>
            <div className="my-1 h-px bg-border/70" />
          </>
        ) : null}
        <button
          role="menuitem"
          className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
          onClick={() => run('back')}
        >
          {translate('auto.components.browser.pane.BrowserPane.40edfa75cb', 'Back')}
        </button>
        <button
          role="menuitem"
          className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
          onClick={() => run('forward')}
        >
          {translate('auto.components.browser.pane.BrowserPane.250a9b3e42', 'Forward')}
        </button>
        <button
          role="menuitem"
          className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
          onClick={() => run('reload')}
        >
          {translate('auto.components.browser.pane.BrowserPane.0e080d820e', 'Reload')}
        </button>
        <div className="my-1 h-px bg-border/70" />
        <button
          role="menuitem"
          className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
          onClick={() => run('external-page')}
        >
          {translate(
            'auto.components.browser.pane.BrowserPane.f7ab83f7ed',
            'Open Page In Default Browser'
          )}
        </button>
        <button
          role="menuitem"
          className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
          onClick={() => run('copy-page')}
        >
          {translate('auto.components.browser.pane.BrowserPane.1b179ab561', 'Copy Page URL')}
        </button>
      </div>
    </>,
    document.body
  )
}
