import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  useMarkupMode,
  type MarkupCaptureContext,
  type MarkupModeController
} from '../annotate/useMarkupMode'
import { useBrowserMarkupCommands } from '../annotate/use-browser-markup-commands'
import { requestBrowserMarkup } from '@/runtime/browser-markup-request'
import { requestBrowserMarkupEditor } from '@/runtime/browser-markup-editor-request'
import type {
  BrowserRemotePaneCommand,
  BrowserRemotePaneState
} from '../../../../../shared/rpc-contract/browser-remote-pane-params'
import {
  deliverMarkupToClipboardVerified,
  deliverMarkupToClipboard
} from '../annotate/markup-clipboard-delivery'

type RemoteMarkupOwner = {
  page: string
  active: boolean
  environmentId: string
  remotePageId: string | null
}
type RemoteMarkupCommand = Extract<BrowserRemotePaneCommand, { action: 'markup' | 'markup-editor' }>
type RemoteMarkupReceipt = Pick<BrowserRemotePaneState, 'markup' | 'markupEditor'>
export function useRemoteBrowserMarkupCapture(
  imageRef: RefObject<HTMLImageElement | null>,
  viewportRef: RefObject<HTMLDivElement | null>,
  owner?: RemoteMarkupOwner
): MarkupModeController & {
  performCommand: (
    command: RemoteMarkupCommand,
    isCurrent: () => boolean,
    expiresAt: number
  ) => Promise<RemoteMarkupReceipt>
} {
  const current = useRef(owner)
  const capturedOwner = useRef(owner)
  useLayoutEffect(() => {
    current.current = owner
  })
  const mode = useMarkupMode({
    getCaptureContext: useCallback((): MarkupCaptureContext | null => {
      const element = imageRef.current
      const container = viewportRef.current
      if (!element || !container) {
        return null
      }
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return null
      }
      capturedOwner.current = current.current
      return {
        source: { kind: 'image', element },
        cssWidth: rect.width,
        cssHeight: rect.height,
        outputScale: window.devicePixelRatio || 1
      }
    }, [imageRef, viewportRef]),
    onDeliver: deliverMarkupToClipboard,
    onDeliverVerified: (result, stillCurrent) => {
      const captured = capturedOwner.current
      const matches = (): boolean =>
        !!captured &&
        !!current.current?.active &&
        current.current.page === captured.page &&
        current.current.environmentId === captured.environmentId &&
        current.current.remotePageId === captured.remotePageId &&
        stillCurrent()
      return deliverMarkupToClipboardVerified(result, matches)
    }
  })
  useBrowserMarkupCommands(owner?.page ?? '', owner?.active ?? false, mode)
  const cancel = mode.cancel
  useEffect(() => () => cancel(), [owner?.page, owner?.environmentId, owner?.remotePageId, cancel])
  return {
    ...mode,
    commandOwner: owner ? { page: owner.page, active: owner.active } : undefined,
    performCommand: async (command, isCurrent, expiresAt) => {
      const value = current.current
      if (
        !value?.active ||
        !isCurrent() ||
        command.environmentId !== value.environmentId ||
        command.expectedRemotePageId !== value.remotePageId
      ) {
        throw new Error('remote_browser_markup_owner_mismatch')
      }
      return command.action === 'markup'
        ? { markup: await requestBrowserMarkup(value.page, command.markupAction, expiresAt) }
        : { markupEditor: await requestBrowserMarkupEditor(value.page, command.editor, expiresAt) }
    }
  }
}
