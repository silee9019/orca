export { useRemoteBrowserPageInputQueue } from './use-remote-browser-input-queue'
import { useCallback } from 'react'
import type { BrowserRemotePaneInputCommand } from '../../../../../shared/rpc-contract/browser-remote-pane-params'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { isEditableKeyboardTarget } from '../host-guest/browser-keyboard'
import {
  getRemoteBrowserKeyboardShortcut,
  getRemoteBrowserKeypressKey
} from './remote-browser-keyboard'
import { isRemoteBrowserPageMissingError } from './remote-browser-stream-errors'
import type { RemoteBrowserStreamLifecycle } from './remote-browser-stream-lifecycle'
import type {
  RemoteBrowserOperationToken,
  RemoteBrowserViewportSize
} from './remote-browser-stream-tokens'
import type { BrowserScreencastFrameMetadata } from '../../../../../shared/browser-screencast-protocol'
import {
  getRemoteBrowserMouseButton,
  resolveRemoteBrowserCssViewport,
  type RemoteBrowserPaneNotice,
  type RemoteBrowserRuntimeTarget
} from './remote-browser-page-input-model'

export function useRemoteBrowserPageInput({
  busy,
  imageRef,
  remoteViewportRef,
  remoteCssViewportSizeRef,
  remoteViewportSizeRef,
  frameMetadata,
  runtimeTarget,
  lifecycle,
  runtimeWorktree,
  enqueueRemoteInput,
  createRemoteOperationToken,
  isCurrentRemoteOperationToken,
  closeMissingRemotePage,
  scheduleRemoteTabInfoRefresh,
  setPaneNotice
}: {
  busy: boolean
  imageRef: React.RefObject<HTMLImageElement | null>
  remoteViewportRef: React.RefObject<HTMLDivElement | null>
  remoteCssViewportSizeRef: React.MutableRefObject<RemoteBrowserViewportSize | null>
  remoteViewportSizeRef: React.MutableRefObject<RemoteBrowserViewportSize | null>
  frameMetadata: BrowserScreencastFrameMetadata | null
  runtimeTarget: () => RemoteBrowserRuntimeTarget | null
  lifecycle: RemoteBrowserStreamLifecycle
  runtimeWorktree: string
  enqueueRemoteInput: (operation: () => Promise<void>) => Promise<void>
  createRemoteOperationToken: (remotePageId?: string | null) => RemoteBrowserOperationToken | null
  isCurrentRemoteOperationToken: (token: RemoteBrowserOperationToken) => boolean
  closeMissingRemotePage: (remotePageId?: string | null) => void
  scheduleRemoteTabInfoRefresh: (token: RemoteBrowserOperationToken, delayMs?: number) => void
  setPaneNotice: (notice: RemoteBrowserPaneNotice | null) => void
}): {
  getRemoteImagePoint: (event: {
    clientX: number
    clientY: number
  }) => { x: number; y: number } | null
  performRemoteInput: (
    command: BrowserRemotePaneInputCommand,
    isCurrent: () => boolean
  ) => Promise<void>
  handleRemotePointerDown: (event: React.PointerEvent<HTMLImageElement>) => void
  handleRemotePointerUp: (event: React.PointerEvent<HTMLImageElement>) => void
  handleRemoteScreenshotKeyDown: (event: React.KeyboardEvent<HTMLImageElement>) => void
} {
  const getRemoteImagePoint = useCallback(
    (event: { clientX: number; clientY: number }): { x: number; y: number } | null => {
      const image = imageRef.current
      const viewport = remoteViewportRef.current
      if (!image || !viewport) {
        return null
      }
      const rect = viewport.getBoundingClientRect()
      const { width: viewportWidth, height: viewportHeight } = resolveRemoteBrowserCssViewport({
        cssViewportSize: remoteCssViewportSizeRef.current,
        requestedViewportSize: remoteViewportSizeRef.current,
        frameMetadata,
        naturalSize: { width: image.naturalWidth, height: image.naturalHeight }
      })
      if (rect.width <= 0 || rect.height <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
        return null
      }
      return {
        x: Math.round(((event.clientX - rect.left) / rect.width) * viewportWidth),
        y: Math.round(((event.clientY - rect.top) / rect.height) * viewportHeight)
      }
    },
    [frameMetadata, imageRef, remoteCssViewportSizeRef, remoteViewportRef, remoteViewportSizeRef]
  )

  const runPointer = (
    event: { clientX: number; clientY: number; button: number; preventDefault: () => void },
    action: 'down' | 'up' | 'click',
    isCurrent: () => boolean = () => true
  ): Promise<void> => {
    const target = runtimeTarget()
    const pageId = lifecycle.tokens.remotePage
    const image = imageRef.current
    const operationToken = pageId ? createRemoteOperationToken(pageId) : null
    const point = getRemoteImagePoint(event)
    const button = getRemoteBrowserMouseButton(event.button)
    if (
      busy ||
      !target ||
      !pageId ||
      !image ||
      !operationToken ||
      !point ||
      !button ||
      button === 'right'
    ) {
      return Promise.reject(new Error('remote_browser_pointer_unavailable'))
    }
    event.preventDefault()
    if (action !== 'up') {
      image.focus()
    }
    setPaneNotice(null)
    return enqueueRemoteInput(async () => {
      const current = (): boolean => isCurrent() && isCurrentRemoteOperationToken(operationToken)
      if (!current()) {
        throw new Error('remote_browser_input_cancelled')
      }
      const params = { worktree: runtimeWorktree, page: pageId }
      const options = { timeoutMs: 15_000, suppressFeatureInteraction: true }
      let releaseRequired = false
      try {
        await callRuntimeRpc(
          target,
          'browser.mouseMove',
          { ...params, x: point.x, y: point.y },
          options
        )
        if (!current()) {
          throw new Error('remote_browser_input_cancelled')
        }
        releaseRequired = action === 'click'
        await callRuntimeRpc(
          target,
          action === 'up' ? 'browser.mouseUp' : 'browser.mouseDown',
          { ...params, button },
          options
        )
        if (action === 'click') {
          await callRuntimeRpc(target, 'browser.mouseUp', { ...params, button }, options)
          releaseRequired = false
        }
        if (!current()) {
          throw new Error('remote_browser_input_cancelled_effect_unknown')
        }
        if (action !== 'down') {
          scheduleRemoteTabInfoRefresh(operationToken, 250)
        }
      } catch (error) {
        if (isCurrentRemoteOperationToken(operationToken)) {
          if (isRemoteBrowserPageMissingError(error)) {
            closeMissingRemotePage(pageId)
          } else {
            setPaneNotice({
              kind: 'consequence',
              text: error instanceof Error ? error.message : 'Remote mouse input failed.'
            })
          }
        }
        if (releaseRequired) {
          try {
            await callRuntimeRpc(target, 'browser.mouseUp', { ...params, button }, options)
          } catch {
            throw new Error('remote_browser_mouse_release_unverifiable')
          }
        }
        throw error
      }
    })
  }
  const handleRemotePointerDown = (event: React.PointerEvent<HTMLImageElement>): void => {
    void runPointer(event, 'down').catch(() => {})
  }
  const handleRemotePointerUp = (event: React.PointerEvent<HTMLImageElement>): void => {
    void runPointer(event, 'up').catch(() => {})
  }

  const runKey = (
    event: {
      target: EventTarget | null
      key: string
      metaKey: boolean
      ctrlKey: boolean
      altKey: boolean
      shiftKey: boolean
      preventDefault: () => void
    },
    isCurrent: () => boolean = () => true
  ): Promise<void> => {
    if (isEditableKeyboardTarget(event.target)) {
      return Promise.reject(new Error('remote_browser_key_unavailable'))
    }
    const target = runtimeTarget()
    const pageId = lifecycle.tokens.remotePage
    const operationToken = pageId ? createRemoteOperationToken(pageId) : null
    if (!target || !pageId || !operationToken) {
      return Promise.reject(new Error('remote_browser_key_unavailable'))
    }
    const params = { worktree: runtimeWorktree, page: pageId }
    const key = getRemoteBrowserKeyboardShortcut(event) ?? getRemoteBrowserKeypressKey(event)
    if (!key) {
      return Promise.reject(new Error('remote_browser_key_unavailable'))
    }
    event.preventDefault()
    setPaneNotice(null)
    return enqueueRemoteInput(async () => {
      if (!isCurrent() || !isCurrentRemoteOperationToken(operationToken)) {
        throw new Error('remote_browser_input_cancelled')
      }
      try {
        await callRuntimeRpc(
          target,
          'browser.keypress',
          { ...params, key },
          { timeoutMs: 15_000, suppressFeatureInteraction: true }
        )
        if (!isCurrent() || !isCurrentRemoteOperationToken(operationToken)) {
          throw new Error('remote_browser_input_cancelled_effect_unknown')
        }
        if (
          key === 'Enter' ||
          key === 'Meta+r' ||
          key === 'Meta+Shift+r' ||
          key === 'Control+r' ||
          key === 'Control+Shift+r'
        ) {
          scheduleRemoteTabInfoRefresh(operationToken, 400)
        }
      } catch (error) {
        if (isCurrentRemoteOperationToken(operationToken)) {
          if (isRemoteBrowserPageMissingError(error)) {
            closeMissingRemotePage(pageId)
          } else {
            setPaneNotice({
              kind: 'consequence',
              text: error instanceof Error ? error.message : 'Remote keyboard input failed.'
            })
          }
        }
        throw error
      }
    })
  }

  const handleRemoteScreenshotKeyDown = (event: React.KeyboardEvent<HTMLImageElement>): void => {
    void runKey(event).catch(() => {})
  }
  const performRemoteInput = (
    command: BrowserRemotePaneInputCommand,
    isCurrent: () => boolean
  ): Promise<void> => {
    if (command.action === 'key') {
      return runKey(
        {
          target: imageRef.current,
          key: command.key,
          metaKey: command.meta,
          ctrlKey: command.ctrl,
          altKey: command.alt,
          shiftKey: command.shift,
          preventDefault: () => {}
        },
        isCurrent
      )
    }
    const rect = remoteViewportRef.current?.getBoundingClientRect()
    if (!rect || command.x >= rect.width || command.y >= rect.height) {
      return Promise.reject(new Error('remote_browser_point_outside_viewport'))
    }
    return runPointer(
      {
        clientX: rect.left + command.x,
        clientY: rect.top + command.y,
        button: command.button === 'left' ? 0 : 1,
        preventDefault: () => {}
      },
      'click',
      isCurrent
    )
  }
  return {
    performRemoteInput,
    getRemoteImagePoint,
    handleRemotePointerDown,
    handleRemotePointerUp,
    handleRemoteScreenshotKeyDown
  }
}
